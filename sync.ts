import { Client } from "@notionhq/client";
import { writeFile, mkdir } from "fs/promises";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
// @ts-ignore
import fetch from "node-fetch";
 
// Load environment variables locally
dotenv.config();
 
// Define the structure your website needs
interface Concert {
  id: string;
  title: string;
  programName: string;
  date: date; // Always YYYY-MM-DD, no time or timezone
  venue: string;
  venueMapUrl: string | null;
  ticketLink: string | null;
  description: string;
  posterUrl: string | null;
  season: string;
}
 
// Clean venue string and create Google Maps URL
function parseVenue(rawVenue: string): { venue: string; mapUrl: string | null } {
  if (!rawVenue || rawVenue === "TBA" || rawVenue === "- :") {
    return { venue: "TBA", mapUrl: null };
  }
 
  // Clean up the venue string (remove @ symbols and extra formatting)
  let venue = rawVenue
    .replace(/@/g, "")
    .replace(/: ,/g, ", ")
    .replace(/- :$/g, "")
    .replace(/: $/g, "")
    .trim();
 
  if (!venue || venue === "-") {
    return { venue: "TBA", mapUrl: null };
  }
 
  // Create Google Maps search URL
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
 
  return { venue, mapUrl };
}
 
// Normalize any Notion date to a plain YYYY-MM-DD string.
// Notion may return "2025-04-19" or "2025-02-02T15:00:00.000-07:00".
// We always want just the date portion in local (Phoenix) terms.
function normalizeDate(raw: string): string {
  // If it's already a plain date (no "T"), return as-is
  if (!raw.includes("T")) {
    return raw;
  }
 
  // Has a time component. The offset (e.g. -07:00) represents the local
  // timezone the date was entered in (Phoenix). We want the local date,
  // NOT the UTC date. Splitting at "T" gives us the local calendar date
  // that was intended, which is correct because Notion stores the offset
  // of the timezone the user was in when they set the date.
  return raw.split("T")[0];
}
 
// Calculate concert season (August starts new season)
// Parses directly from the YYYY-MM-DD string to avoid Date constructor quirks
function getSeason(dateStr: string): string {
  const [yearStr, monthStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-12
 
  // If August (8) or later, it's the start of a new season: YEAR–YEAR+1
  // If before August (Jan–Jul), it's still the previous season: YEAR-1–YEAR
  if (month >= 8) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}
 
const notion = new Client({ auth: process.env.NOTION_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const POSTERS_DIR = "posters";
 
// Download a file from URL using node-fetch
async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }
  const buffer = await response.buffer();
  fs.writeFileSync(dest, buffer);
}
 
// Get the image file from Posters (prefer PNG/JPG over PDF)
function getPosterFile(files: any[]): { url: string; name: string } | null {
  if (!files || files.length === 0) return null;
 
  // Prefer image formats over PDF
  const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
 
  // First, look for an image file
  for (const file of files) {
    const name = file.name?.toLowerCase() || "";
    if (imageExtensions.some((ext) => name.endsWith(ext))) {
      return {
        url: file.file?.url || file.external?.url,
        name: file.name,
      };
    }
  }
 
  // If no image found, skip PDF (can't display in img tag)
  return null;
}
 
async function fetchConcerts() {
  if (!DATABASE_ID) throw new Error("Missing NOTION_DATABASE_ID");
 
  console.log("Fetching ALL concerts from Notion...");
 
  // Ensure posters directory exists
  await mkdir(POSTERS_DIR, { recursive: true });
 
  // Query ALL concerts (no status filter), sorted by date
  let allResults: any[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;
 
  while (hasMore) {
    const response: any = await notion.databases.query({
      database_id: DATABASE_ID,
      start_cursor: startCursor,
      sorts: [
        {
          property: "Date",
          direction: "ascending",
        },
      ],
    });
 
    allResults = allResults.concat(response.results);
    hasMore = response.has_more;
    startCursor = response.next_cursor;
  }
 
  console.log(`  Found ${allResults.length} total concerts`);
 
  // Map the raw Notion API response to your clean JSON
  const concerts: Concert[] = [];
 
  for (const page of allResults) {
    const props = (page as any).properties;
    const pageId = (page as any).id.replace(/-/g, ""); // Remove dashes for filename
    const rawDate = props["Date"]?.date?.start || "";
 
    // Skip if no date
    if (!rawDate) continue;
 
    // Normalize to plain YYYY-MM-DD — strips time and timezone
    const date = normalizeDate(rawDate);
 
    // Get poster file info
    const posterFile = getPosterFile(props["Posters"]?.files);
    let posterUrl: string | null = null;
 
    if (posterFile) {
      // Determine file extension
      const ext = path.extname(posterFile.name).toLowerCase() || ".png";
      const posterFilename = `${pageId}${ext}`;
      const posterPath = path.join(POSTERS_DIR, posterFilename);
 
      try {
        // Always download fresh to get updates
        console.log(`  Downloading poster: ${posterFile.name}`);
        await downloadFile(posterFile.url, posterPath);
        // Use relative path for GitHub Pages
        posterUrl = `posters/${posterFilename}`;
        console.log(`  ✓ Saved to: ${posterUrl}`);
      } catch (err) {
        console.error(`  ✗ Failed to download poster: ${err}`);
      }
    }
 
    // Parse venue and create map URL
    const { venue, mapUrl } = parseVenue(
      props["Location"]?.formula?.string || ""
    );
 
    concerts.push({
      id: (page as any).id,
      title:
        props["Program Name"]?.rich_text?.[0]?.plain_text ||
        props["Name"]?.title?.[0]?.plain_text ||
        "Untitled Event",
      programName: props["Name"]?.title?.[0]?.plain_text || "",
      date,
      venue,
      venueMapUrl: mapUrl,
      ticketLink: props["Link to Purchase Tickets"]?.url || null,
      description:
        props["Promotional Blurb"]?.rich_text?.[0]?.plain_text || "",
      posterUrl,
      season: getSeason(date),
    });
  }
 
  // Sort by date
  concerts.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
 
  // Write to file
  await writeFile("concerts.json", JSON.stringify(concerts, null, 2));
  console.log(
    `\n✅ Success! Generated concerts.json with ${concerts.length} concerts.`
  );
}
 
fetchConcerts().catch((err) => {
  console.error(err);
  process.exit(1);
});
