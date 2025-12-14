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
  date: string;
  venue: string;
  ticketLink: string | null;
  description: string;
  posterUrl: string | null;
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
    if (imageExtensions.some(ext => name.endsWith(ext))) {
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

  console.log("Fetching upcoming concerts from Notion...");

  // Ensure posters directory exists
  await mkdir(POSTERS_DIR, { recursive: true });

  // Query the database - filter for Future, Next, or Current concerts
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      or: [
        {
          property: "Status",
          status: { equals: "Future" },
        },
        {
          property: "Status",
          status: { equals: "Next" },
        },
        {
          property: "Status",
          status: { equals: "Current" },
        },
      ],
    },
    sorts: [
      {
        property: "Date",
        direction: "ascending",
      },
    ],
  });

  // Map the raw Notion API response to your clean JSON
  const concerts: Concert[] = [];

  for (const page of response.results) {
    const props = (page as any).properties;
    const pageId = (page as any).id.replace(/-/g, ""); // Remove dashes for filename

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

    concerts.push({
      id: (page as any).id,
      title: props["Program Name"]?.rich_text?.[0]?.plain_text || props["Name"]?.title?.[0]?.plain_text || "Untitled Event",
      programName: props["Name"]?.title?.[0]?.plain_text || "",
      date: props["Date"]?.date?.start || "",
      venue: props["Location"]?.formula?.string || "TBA",
      ticketLink: props["Link to Purchase Tickets"]?.url || null,
      description: props["Promotional Blurb"]?.rich_text?.[0]?.plain_text || "",
      posterUrl,
    });
  }

  // Filter out any events with missing dates
  const validConcerts = concerts.filter((c) => c.date !== "");

  // Write to file
  await writeFile("concerts.json", JSON.stringify(validConcerts, null, 2));
  console.log(
    `\n✅ Success! Generated concerts.json with ${validConcerts.length} upcoming events.`
  );
}

fetchConcerts().catch((err) => {
  console.error(err);
  process.exit(1);
});
