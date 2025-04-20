/*
 * Copyright (c) 2025 Alfred Simon and Pitcocy
 * All rights reserved.
 * 
 * This script is the property of Alfred Simon and Pitcocy.
 * Unauthorized use, modification, or distribution is prohibited.
 * 
 * For inquiries, please contact: alfred@pitcocy.com
 */

// Configuration variables
const ALERT_EMAILS           = ['john@doe.com'];
const DISPLAY_THRESHOLD      = 0.01;  // 1% of total spend
const VIDEO_THRESHOLD        = 0.01;  // 1% of total spend
const SEARCH_THRESHOLD       = 0.05;  // 5% of total spend
const GMC_ID                 = 8653526;
const MIN_CLICKS             = 1;




//Date range selector
//Only use one of the following: TODAY, YESTERDAY, LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS

const PMAX_DATE_RANGE        = 'LAST_7_DAYS'; // Date range for PMax queries
const SHOPPING_DATE_RANGE    = 'LAST_7_DAYS'; // Date range for Shopping/product queries





/* --------- No changes beyond this line --------- */
//------------------------------------------------------------------------------------

function main() {
  Logger.log('🚀 Starting Shopping Alert Script...');
  Logger.log('Step 1/3: Running PMax Network Alerts...');
  runPMaxAlerts();
  Logger.log('Step 2/3: Gathering click data for product analysis...');
  const clickedIds = getClickedIds();
  Logger.log('Step 3/3: Analyzing product issues...');
  runProductAlerts(clickedIds);
  Logger.log('✅ Script execution completed.');
}

function getClickedIds() {
  const ids = new Set();
  const query = `
    SELECT segments.product_item_id, metrics.clicks
    FROM shopping_performance_view
    WHERE segments.date DURING ${SHOPPING_DATE_RANGE}
  `;
  const rows = AdsApp.search(query);
  while (rows.hasNext()) {
    const r = rows.next();
    const idRaw = r.segments.productItemId || r['segments.product_item_id'];
    const idNorm = offerId(idRaw).toLowerCase();
    const clicks = r.metrics.clicks;
    if (idNorm && clicks >= MIN_CLICKS) {
      ids.add(idNorm);
    }
  }
  Logger.log(`Found ${ids.size} products with ${MIN_CLICKS}+ clicks in ${SHOPPING_DATE_RANGE}`);
  return ids;
}

// ===== PMAX Network alert =====
function runPMaxAlerts() {
  const cQuery = `
    SELECT 
      campaign.name,
      metrics.cost_micros
    FROM campaign 
    WHERE 
      segments.date DURING ${PMAX_DATE_RANGE}
      AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND metrics.cost_micros > 0
    ORDER BY campaign.name`;

  const dvQuery = `
    SELECT 
      campaign.name,
      segments.asset_interaction_target.asset,
      metrics.cost_micros,
      campaign.advertising_channel_type,
      segments.asset_interaction_target.interaction_on_this_asset
    FROM campaign 
    WHERE 
      segments.date DURING ${PMAX_DATE_RANGE}
      AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND segments.asset_interaction_target.interaction_on_this_asset != 'TRUE'
    ORDER BY campaign.name`;

  const pQuery = `
    SELECT 
      campaign.name,
      segments.product_title,
      metrics.cost_micros,
      campaign.advertising_channel_type
    FROM shopping_performance_view 
    WHERE 
      segments.date DURING ${PMAX_DATE_RANGE}
      AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
    ORDER BY campaign.name`;

  const adsQuery = `
    SELECT 
      campaign.name,
      asset.resource_name,
      asset_group_asset.field_type
    FROM asset_group_asset
    WHERE 
      campaign.status = 'ENABLED'
    `;

  const campaignData = getAllReportData({
    campaign: { query: cQuery },
    display: { query: dvQuery },
    products: { query: pQuery },
    assets: { query: adsQuery }
  });

  processNetworkData(campaignData);
}

function getAllReportData(queryConfigs) {
  const results = {};
  for (const reportName in queryConfigs) {
    const config = queryConfigs[reportName];
    const report = AdsApp.search(config.query);
    const data = [];
    while (report.hasNext()) {
      data.push(report.next());
    }
    results[reportName] = data;
  }
  return results;
}

function processNetworkData(data) {
  const campaignNetworkSpend = new Map();
  data.products.forEach(function(row) {
    const campaignName = row.campaign.name;
    const cost = row.metrics.costMicros / 1000000;
    if (!campaignNetworkSpend.has(campaignName)) {
      campaignNetworkSpend.set(campaignName, {
        shopping: 0,
        display: 0,
        youtube: 0,
        search: 0,
        total: 0
      });
    }
    const spendData = campaignNetworkSpend.get(campaignName);
    spendData.shopping += cost;
    spendData.total += cost;
  });
  const assetTypes = new Map();
  data.assets.forEach(function(row) {
    assetTypes.set(row.asset.resourceName, row.assetGroupAsset.fieldType);
  });
  const campaignTotals = new Map();
  data.campaign.forEach(function(row) {
    const campaignName = row.campaign.name;
    const totalCost = row.metrics.costMicros / 1000000;
    campaignTotals.set(campaignName, totalCost);
  });
  data.display.forEach(function(row) {
    const campaignName = row.campaign.name;
    const cost = row.metrics.costMicros / 1000000;
    const assetId = row.segments.assetInteractionTarget.asset;
    const assetType = assetTypes.get(assetId);
    if (!campaignNetworkSpend.has(campaignName)) {
      campaignNetworkSpend.set(campaignName, {
        shopping: 0,
        display: 0,
        youtube: 0,
        search: 0,
        total: 0
      });
    }
    const spendData = campaignNetworkSpend.get(campaignName);
    if (assetType === 'YOUTUBE_VIDEO') {
      spendData.youtube += cost;
    } else if (assetType === 'MARKETING_IMAGE' || assetType === 'PORTRAIT_MARKETING_IMAGE' || assetType === 'SQUARE_MARKETING_IMAGE') {
      spendData.display += cost;
    }
  });
  for (const campaignName2 of campaignNetworkSpend.keys()) {
    const spendData2 = campaignNetworkSpend.get(campaignName2);
    const totalCampaignCost = campaignTotals.get(campaignName2) || 0;
    spendData2.total = totalCampaignCost;
    spendData2.search = totalCampaignCost - (spendData2.shopping + spendData2.display + spendData2.youtube);
  }
  checkAndSendAlerts(campaignNetworkSpend);
}

function checkAndSendAlerts(campaignNetworkSpend) {
  const displayAlerts = [];
  const videoAlerts = [];
  const searchAlerts = [];
  for (const entry of campaignNetworkSpend.entries()) {
    const campaignName = entry[0];
    const spendData = entry[1];
    if (spendData.total === 0) continue;
    const displayRatio = spendData.display / spendData.total;
    const videoRatio = spendData.youtube / spendData.total;
    const searchRatio = spendData.search / spendData.total;
    if (displayRatio > DISPLAY_THRESHOLD) {
      displayAlerts.push({
        campaign: campaignName,
        ratio: (displayRatio * 100).toFixed(1),
        spend: spendData.display.toFixed(2)
      });
    }
    if (videoRatio > VIDEO_THRESHOLD) {
      videoAlerts.push({
        campaign: campaignName,
        ratio: (videoRatio * 100).toFixed(1),
        spend: spendData.youtube.toFixed(2)
      });
    }
    if (searchRatio > SEARCH_THRESHOLD) {
      searchAlerts.push({
        campaign: campaignName,
        ratio: (searchRatio * 100).toFixed(1),
        spend: spendData.search.toFixed(2)
      });
    }
  }
  if (displayAlerts.length > 0 || videoAlerts.length > 0 || searchAlerts.length > 0) {
    Logger.log(`Found network alerts: Display(${displayAlerts.length}), Video(${videoAlerts.length}), Search(${searchAlerts.length})`);
    sendAlertEmail(displayAlerts, videoAlerts, searchAlerts);
  }
}

function sendAlertEmail(displayAlerts, videoAlerts, searchAlerts) {
  const date = new Date();
  const accountName = AdsApp.currentAccount().getName();
  const subject = 'PMax Network Alert - ' + accountName + ' - ' + Utilities.formatDate(date, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');
  let body = 'Performance Max Network Spend Alert\n\n';
  body += 'The following campaigns have exceeded network spend thresholds in the date range: ' + PMAX_DATE_RANGE + '\n\n';
  if (displayAlerts.length > 0) {
    body += 'Display Network Alerts (>' + (DISPLAY_THRESHOLD * 100) + '% threshold):\n';
    displayAlerts.forEach(function(alert) {
      body += '- ' + alert.campaign + ': ' + alert.ratio + '% ($' + alert.spend + ')\n';
    });
    body += '\n';
  }
  if (videoAlerts.length > 0) {
    body += 'YouTube Network Alerts (>' + (VIDEO_THRESHOLD * 100) + '% threshold):\n';
    videoAlerts.forEach(function(alert) {
      body += '- ' + alert.campaign + ': ' + alert.ratio + '% ($' + alert.spend + ')\n';
    });
    body += '\n';
  }
  if (searchAlerts.length > 0) {
    body += 'Search Network Alerts (>' + (SEARCH_THRESHOLD * 100) + '% threshold):\n';
    searchAlerts.forEach(function(alert) {
      body += '- ' + alert.campaign + ': ' + alert.ratio + '% ($' + alert.spend + ')\n';
    });
  }
  MailApp.sendEmail({
    to: ALERT_EMAILS.join(','),
    subject: subject,
    body: body
  });
}

// ===== Product‑disapproval alert =====
function runProductAlerts(clickedIds) {
  if (!ShoppingContent || !ShoppingContent.Productstatuses) {
    throw new Error('ShoppingContent advanced service is not enabled. Please enable it in Resources > Advanced Google services.');
  }
  const { disapproved, outOfStock } = getProblematicItems(clickedIds);
  Logger.log(`Found ${disapproved.length} disapproved and ${outOfStock.length} out of stock products`);
  
  if (disapproved.length === 0 && outOfStock.length === 0) {
    Logger.log('No product issues found. No alert email needed.');
    return;
  }
  
  Logger.log('Calculating performance impact...');
  const impactDisapproved = getPerformanceImpact(disapproved);
  const impactOutOfStock = getPerformanceImpact(outOfStock);
  
  Logger.log('Sending product alert email...');
  sendProductEmail(disapproved, outOfStock, impactDisapproved, impactOutOfStock);
}

function getProblematicItems(clickedIds) {
  Logger.log('Analyzing product feed status...');
  const disapproved = [];
  const outOfStock = [];
  let pageToken = null;
  let processedCount = 0;
  do {
    const resp = ShoppingContent.Productstatuses.list(GMC_ID, {
      maxResults: 250,
      pageToken: pageToken,
      fields: 'resources(productId,title,' +
              'destinationStatuses(destination,status),' +
              'itemLevelIssues(code,description,servability)),' +
              'nextPageToken'
    });
    if (!resp.resources) break;
    for (let i = 0; i < resp.resources.length; i++) {
      const prod = resp.resources[i];
      processedCount++;
      const normId = offerId(prod.productId);
      if (!clickedIds.has(normId)) continue;
      
      const badDest  = (prod.destinationStatuses || []).find(ds => (ds.status || '').toLowerCase() === 'disapproved');
      const badIssue = (prod.itemLevelIssues    || []).find(is => is.servability === 'disapproved');
      
      try {
        const prodData = ShoppingContent.Products.get(GMC_ID, prod.productId || '');
        const availability = (prodData.availability || '').toLowerCase();
        const isOutOfStock = availability === 'out of stock';
        const isDisapproved = !!badDest || !!badIssue;
        
        const perf = getProductPerformance(normId);
        if (isDisapproved) {
          disapproved.push({
            id: normId,
            clicks: perf.clicks,
            cost: perf.cost,
            conv: perf.conv,
            revenue: perf.revenue
          });
        }
        if (isOutOfStock) {
          outOfStock.push({
            id: normId,
            clicks: perf.clicks,
            cost: perf.cost,
            conv: perf.conv,
            revenue: perf.revenue
          });
        }
      } catch (e) {
        Logger.log(`Error processing product ${prod.productId}: ${e}`);
      }
    }
    pageToken = resp.nextPageToken;
  } while (pageToken);
  
  return { disapproved, outOfStock };
}

function getProductPerformance(productId) {
  const query = `
    SELECT
      segments.product_item_id,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM shopping_performance_view
    WHERE segments.product_item_id = '${productId}'
      AND segments.date DURING ${SHOPPING_DATE_RANGE}
  `;
  const rows = AdsApp.search(query);
  let clicks = 0, cost = 0, conv = 0, revenue = 0;
  while (rows.hasNext()) {
    const r = rows.next();
    clicks  += Number(r.metrics.clicks) || 0;
    cost    += Number(r.metrics.costMicros) / 1e6;
    conv    += Number(r.metrics.conversions) || 0;
    revenue += Number(r.metrics.conversionsValue) || 0;
  }
  return { clicks, cost, conv, revenue };
}

function getPerformanceImpact(items) {
  if (items.length === 0) return {lostClicks: 0, lostClicksPct: 0, lostRev: 0, lostRevPct: 0};
  const ids = items.map(p => `'${p.id}'`).join(',');
  const query = `
    SELECT segments.product_item_id, metrics.clicks, metrics.conversions_value
    FROM shopping_performance_view
    WHERE segments.date DURING ${SHOPPING_DATE_RANGE}
      AND segments.product_item_id IN (${ids})
  `;
  const rows = AdsApp.search(query);
  let lostClicks = 0, lostRev = 0, totalClicks = 0, totalRev = 0;
  while (rows.hasNext()) {
    const r = rows.next();
    const id = r.segments.productItemId || r['segments.product_item_id'];
    const clicks = Number(r.metrics.clicks) || 0;
    const revenue = Number(r.metrics.conversionsValue) || 0;
    if (ids.indexOf(`'${id}'`) !== -1) {
      lostClicks = Number(lostClicks) + clicks;
      lostRev = Number(lostRev) + revenue;
    }
    totalClicks = Number(totalClicks) + clicks;
    totalRev = Number(totalRev) + revenue;
  }
  const lostClicksPct = totalClicks > 0 ? Math.round(100 * lostClicks / totalClicks) : 0;
  const lostRevPct = totalRev > 0 ? Math.round(100 * lostRev / totalRev) : 0;
  return {lostClicks: lostClicks, lostClicksPct: lostClicksPct, lostRev: lostRev, lostRevPct: lostRevPct};
}

function sendProductEmail(disapproved, outOfStock, impactDisapproved, impactOutOfStock) {
  const accountName = AdsApp.currentAccount().getName();
  const subject = 'Product Alert - ' + accountName + ' - ' + today();
  const totalLostClicks = impactDisapproved.lostClicks + impactOutOfStock.lostClicks;
  const totalLostRev = impactDisapproved.lostRev + impactOutOfStock.lostRev;
  
  // Format numbers to avoid scientific notation
  const formatNumber = (num) => {
    if (typeof num !== 'number') return '0';
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  let htmlBody  = '<b>⚠️ Product Issues Detected</b><br><br>';
  htmlBody     += '<b>Potential missed performance (' + SHOPPING_DATE_RANGE + '):</b><br>';
  htmlBody     += 'Lost clicks: <b>' + formatNumber(totalLostClicks) + '</b><br>';
  htmlBody     += 'Lost revenue: <b>€' + totalLostRev.toFixed(2) + '</b><br><br>';

  htmlBody += '<b>Total Impact:</b><br>';
  htmlBody += '<ul>';
  htmlBody += '<li>Lost clicks: <b>' + formatNumber(totalLostClicks) + '</b></li>';
  htmlBody += '<li>Lost revenue: <b>€' + totalLostRev.toFixed(2) + '</b></li>';
  htmlBody += '</ul>';

  htmlBody += '<b>Disapproved Products: ' + disapproved.length + '</b><br>';
  htmlBody += 'Lost clicks: <b>' + formatNumber(impactDisapproved.lostClicks) + '</b><br>';
  htmlBody += 'Lost revenue: <b>€' + impactDisapproved.lostRev.toFixed(2) + '</b><br>';
  if (disapproved.length > 0) {
    disapproved.sort((a, b) => b.revenue - a.revenue);
    htmlBody += 'Top offenders (by revenue):<ul>';
    for (let i = 0; i < Math.min(10, disapproved.length); i++) {
      const p = disapproved[i];
      htmlBody += '<li>' + p.id + ': €' + p.revenue.toFixed(2) + ' revenue, ' + formatNumber(Number(p.clicks)) + ' clicks</li>';
    }
    htmlBody += '</ul>';
  }

  htmlBody += '<br><b>Out of Stock Products: ' + outOfStock.length + '</b><br>';
  htmlBody += 'Lost clicks: <b>' + formatNumber(impactOutOfStock.lostClicks) + '</b><br>';
  htmlBody += 'Lost revenue: <b>€' + impactOutOfStock.lostRev.toFixed(2) + '</b><br>';
  if (outOfStock.length > 0) {
    outOfStock.sort((a, b) => b.revenue - a.revenue);
    htmlBody += 'Top offenders (by revenue):<ul>';
    for (let i = 0; i < Math.min(10, outOfStock.length); i++) {
      const p = outOfStock[i];
      htmlBody += '<li>' + p.id + ': €' + p.revenue.toFixed(2) + ' revenue, ' + formatNumber(Number(p.clicks)) + ' clicks</li>';
    }
    htmlBody += '</ul>';
  }

  let body  = '⚠️ Product Issues Detected\n\n';
  body     += 'Potential missed performance (' + SHOPPING_DATE_RANGE + '):\n';
  body     += 'Lost clicks: ' + formatNumber(totalLostClicks) + '\n';
  body     += 'Lost revenue: €' + totalLostRev.toFixed(2) + '\n\n';
  body += 'Total Impact:\n';
  body += '- Lost clicks: ' + formatNumber(totalLostClicks) + '\n';
  body += '- Lost revenue: €' + totalLostRev.toFixed(2) + '\n\n';
  body += 'Disapproved Products: ' + disapproved.length + '\n';
  body += 'Lost clicks: ' + formatNumber(impactDisapproved.lostClicks) + '\n';
  body += 'Lost revenue: €' + impactDisapproved.lostRev.toFixed(2) + '\n';
  if (disapproved.length > 0) {
    body += 'Top offenders (by revenue):\n';
    for (let i = 0; i < Math.min(10, disapproved.length); i++) {
      const p = disapproved[i];
      body += '- ' + p.id + ': €' + p.revenue.toFixed(2) + ' revenue, ' + formatNumber(Number(p.clicks)) + ' clicks\n';
    }
    body += '\n';
  }
  body += '\nOut of Stock Products: ' + outOfStock.length + '\n';
  body += 'Lost clicks: ' + formatNumber(impactOutOfStock.lostClicks) + '\n';
  body += 'Lost revenue: €' + impactOutOfStock.lostRev.toFixed(2) + '\n';
  if (outOfStock.length > 0) {
    body += 'Top offenders (by revenue):\n';
    for (let i = 0; i < Math.min(10, outOfStock.length); i++) {
      const p = outOfStock[i];
      body += '- ' + p.id + ': €' + p.revenue.toFixed(2) + ' revenue, ' + formatNumber(Number(p.clicks)) + ' clicks\n';
    }
    body += '\n';
  }

  MailApp.sendEmail({
    to: ALERT_EMAILS.join(','),
    subject: subject,
    body: body,
    htmlBody: htmlBody
  });
}

function today() {
  return Utilities.formatDate(new Date(), AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');
}

function offerId(id) {
  return (id || '').split(':').pop().toLowerCase();
}