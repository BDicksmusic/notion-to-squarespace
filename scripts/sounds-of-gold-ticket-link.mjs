import { Client } from "@notionhq/client";

const PAGE_ID = "4e301c77-9dd1-48e9-9359-a4682712e79c";
const EVENT_ID = "1bf52210-b31a-4b22-b035-1a6c14d56c20";
const BASE_URL = "https://srb-tickets.cuecapture.io";
const TICKET_URL = `${BASE_URL}/sounds-of-gold-2026`;
const PROPERTY = "Link to Purchase Tickets";
const text = (parts = []) => parts.map((part) => part.plain_text ?? part.text?.content ?? "").join("");
const normalizeId = (id = "") => id.replaceAll("-", "");

async function main() {
  const mode = process.env.TICKET_LINK_MODE ?? "inspect";
  if (!["inspect", "publish"].includes(mode)) throw new Error("Unsupported mode");
  if (!process.env.NOTION_KEY || !process.env.NOTION_DATABASE_ID) throw new Error("Missing Notion configuration");
  const notion = new Client({ auth: process.env.NOTION_KEY });
  const page = await notion.pages.retrieve({ page_id: PAGE_ID });
  if (!("properties" in page) || page.archived) throw new Error("Concert page is unavailable");
  if (normalizeId(page.parent.database_id) !== normalizeId(process.env.NOTION_DATABASE_ID)) {
    throw new Error("Concert is outside the configured database");
  }
  const props = page.properties;
  const title = text(props["Program Name"]?.rich_text) || text(props.Name?.title);
  const date = props.Date?.date?.start;
  if (title.trim() !== "Sounds of Gold" || !date?.startsWith("2026-10-04")) {
    throw new Error("Concert title or date does not match the approved launch");
  }
  if (props[PROPERTY]?.type !== "url") throw new Error("Ticket link property must be a URL");
  const previousUrl = props[PROPERTY].url;
  console.log(JSON.stringify({ pageId: page.id, title, date, previousUrl, targetUrl: TICKET_URL, mode }));
  if (mode === "inspect") return;
  if (previousUrl && previousUrl !== TICKET_URL) throw new Error("A different ticket URL is already present; review before replacing");

  const response = await fetch(`${BASE_URL}/api/health`);
  const health = await response.json();
  if (!response.ok || !health.ok || health.environment !== "production" || !health.paymentReady ||
      health.event?.id !== EVENT_ID || health.event?.slug !== "sounds-of-gold-2026" ||
      health.event?.sales_status !== "on_sale" || health.event?.admission_price_cents !== 3000 ||
      health.event?.currency !== "usd") {
    throw new Error("The production concert is not ready for public sales");
  }
  if (previousUrl !== TICKET_URL) {
    await notion.pages.update({ page_id: PAGE_ID, properties: { [PROPERTY]: { url: TICKET_URL } } });
  }
  const verified = await notion.pages.retrieve({ page_id: PAGE_ID });
  if (!("properties" in verified) || verified.properties[PROPERTY]?.url !== TICKET_URL) {
    throw new Error("Notion ticket URL read-back failed");
  }
  console.log("Verified Sounds of Gold ticket URL in Notion.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Ticket link operation failed");
  process.exitCode = 1;
});
