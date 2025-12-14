# Notion to Squarespace Concert Sync

Automatically syncs concert/event data from a Notion database to a JSON file that can be consumed by Squarespace.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Environment File

Create a `.env` file in the root directory with your credentials:

```
NOTION_KEY=your_notion_integration_secret_here
NOTION_DATABASE_ID=your_database_id_here
```

### 3. Notion Database Requirements

Your Notion database should have these properties:
- **Status** (Select) - Filter for "Confirmed" events
- **Event Name** (Title) - Name of the event
- **Date** (Date) - Event date
- **Venue** (Rich Text) - Location of the event
- **Ticket Link** (URL) - Optional link to purchase tickets

### 4. Run Locally

```bash
npm run sync
```

This generates `concerts.json` with your event data.

## GitHub Automation

### Setup GitHub Actions

1. Push this code to a GitHub repository
2. Go to **Settings → Secrets and variables → Actions**
3. Add two repository secrets:
   - `NOTION_KEY`: Your Notion integration token
   - `NOTION_DATABASE_ID`: `16c5b402ad174985853ed3efdc405dd1`

4. Enable GitHub Pages:
   - Go to **Settings → Pages**
   - Source: Deploy from a branch
   - Branch: `main`, folder: `/ (root)`

The workflow runs every hour and commits updated `concerts.json` automatically.

## Squarespace Integration

Add a **Code Block** to your Squarespace page with this HTML:

```html
<div id="concert-list">
  <p style="text-align:center; opacity: 0.6;">Loading schedule...</p>
</div>

<script>
  // REPLACE THIS with your actual GitHub Pages URL
  const JSON_URL = 'https://[your-username].github.io/[repo-name]/concerts.json';

  async function loadConcerts() {
    try {
      const response = await fetch(JSON_URL + '?t=' + new Date().getTime());
      const concerts = await response.json();
      const container = document.getElementById('concert-list');
      
      if (concerts.length === 0) {
        container.innerHTML = '<p>No upcoming concerts scheduled.</p>';
        return;
      }

      let html = '';
      
      concerts.forEach(gig => {
        const dateObj = new Date(gig.date);
        const dateStr = dateObj.toLocaleDateString('en-US', { 
          month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' 
        });

        html += `
          <div class="concert-item">
            <div class="concert-date">${dateStr}</div>
            <div class="concert-info">
              <h3>${gig.title}</h3>
              <div class="venue">${gig.venue}</div>
            </div>
            <div class="concert-cta">
              ${gig.ticketLink 
                ? `<a href="${gig.ticketLink}" target="_blank" class="sqs-block-button-element--small sqs-button-element--primary">Tickets</a>` 
                : `<span class="no-tix">Free / TBD</span>`}
            </div>
          </div>
          <hr style="opacity:0.2; margin: 20px 0;">
        `;
      });

      container.innerHTML = html;
      
    } catch (error) {
      console.error('Error:', error);
      document.getElementById('concert-list').innerHTML = '<p>Unable to load schedule.</p>';
    }
  }

  loadConcerts();
</script>

<style>
  .concert-item {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 0;
  }
  .concert-date {
    font-weight: bold;
    min-width: 120px;
    color: #555;
    text-transform: uppercase;
    font-size: 0.9em;
  }
  .concert-info {
    flex-grow: 1;
  }
  .concert-info h3 {
    margin: 0;
    font-size: 1.2em;
  }
  .venue {
    font-size: 0.9em;
    opacity: 0.8;
  }
  
  @media (max-width: 600px) {
    .concert-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }
  }
</style>
```

## File Structure

```
├── .github/
│   └── workflows/
│       └── update.yml    # GitHub Actions workflow
├── .gitignore
├── concerts.json         # Generated output (auto-committed)
├── package.json
├── README.md
├── sync.ts               # Main sync script
└── tsconfig.json
```

