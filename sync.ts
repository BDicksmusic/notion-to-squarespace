import { Client } from "@notionhq/client";
import { writeFile } from "fs/promises";
import * as dotenv from "dotenv";

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
}

const notion = new Client({ auth: process.env.NOTION_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

async function fetchConcerts() {
  if (!DATABASE_ID) throw new Error("Missing NOTION_DATABASE_ID");

  console.log("Fetching upcoming concerts from Notion...");

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
  const concerts: Concert[] = response.results.map((page: any) => {
    const props = page.properties;

    // Extract values with safety checks
    return {
      id: page.id,
      title: props["Program Name"]?.rich_text?.[0]?.plain_text || props["Name"]?.title?.[0]?.plain_text || "Untitled Event",
      programName: props["Name"]?.title?.[0]?.plain_text || "",
      date: props["Date"]?.date?.start || "",
      venue: props["Location"]?.formula?.string || "TBA",
      ticketLink: props["Link to Purchase Tickets"]?.url || null,
      description: props["Promotional Blurb"]?.rich_text?.[0]?.plain_text || "",
    };
  });

  // Filter out any events with missing dates
  const validConcerts = concerts.filter((c) => c.date !== "");

  // Write to file
  await writeFile("concerts.json", JSON.stringify(validConcerts, null, 2));
  console.log(
    `✅ Success! Generated concerts.json with ${validConcerts.length} upcoming events.`
  );
}

fetchConcerts().catch((err) => {
  console.error(err);
  process.exit(1);
});
