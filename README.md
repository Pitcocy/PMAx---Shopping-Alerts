# PMax & Shopping Alerts Script

A Google Ads script that monitors Performance Max campaigns and Shopping products, providing alerts for:
- Network spend distribution in PMax campaigns
- Disapproved products
- Out of stock products

## Features

### PMax Network Alerts

We all love the Mike Rhodes script, but we all hate opening spreadsheets to check network spend.
Well, this script is a modernized version of the Mike Rhodes script that sends alerts straight to your inbox.
So you only have to open the sheets when there are issues.

- Monitors spend distribution across networks (Display, YouTube, Search)
- Configurable thresholds for each network
- Email alerts when thresholds are exceeded

### Product Status Alerts
- Tracks disapproved products
- Monitors out-of-stock items
- Calculates potential revenue impact
- Detailed performance metrics for affected products

## Configuration

```javascript
const ALERT_EMAILS     = ['your.email@domain.com'];
const DISPLAY_THRESHOLD = 0.01;  // 1% of total spend
const VIDEO_THRESHOLD   = 0.01;  // 1% of total spend
const SEARCH_THRESHOLD  = 0.05;  // 5% of total spend
const GMC_ID           = YOUR_GMC_ID;
const MIN_CLICKS       = 1;

// Date range options: TODAY, YESTERDAY, LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS
const PMAX_DATE_RANGE   = 'LAST_7_DAYS';
const SHOPPING_DATE_RANGE = 'LAST_7_DAYS';
```

## Setup

1. Enable the Shopping Content API in Advanced Google Services
2. Update the configuration variables at the top of the script
3. Set up the script to run on your desired schedule

## Email Alert Format

### PMax Network Alerts
- Subject: "PMax Network Alert - [Account Name] - [Date]"
- Details on campaigns exceeding network thresholds
- Spend percentages and amounts by network

### Product Alerts
- Subject: "Product Alert - [Account Name] - [Date]"
- Summary of lost clicks and revenue
- Lists of disapproved and out-of-stock products
- Performance impact metrics

## Requirements

- Google Ads account with Performance Max campaigns
- Google Merchant Center account
- Shopping Content API access

## Author

Alfred Simon (alfred@pitcocy.com)

## License

Copyright © 2025 Alfred Simon and Pitcocy. All rights reserved. 