'use strict';

function finitePositive(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>0;
}

function matchControls(symbol,market,excluded,count=3){
  const origin=market?.[symbol];
  if(!origin||!finitePositive(origin.price))return[];
  const ranked=[];
  for(const [other,row] of Object.entries(market||{})){
    if(other===symbol||excluded.has(other))continue;
    if(!finitePositive(row?.price))continue;
    const volume=Math.max(0,Number(row?.volume)||0);
    const change=Number(row?.change);
    if(!Number.isFinite(change))continue;
    const distance=Math.abs(Math.log1p(volume)-Math.log1p(Math.max(0,Number(origin.volume)||0)))
      +Math.abs(change-Number(origin.change||0))/5;
    ranked.push({symbol:other,price0:Number(row.price),match_distance:distance});
  }
  ranked.sort((a,b)=>a.match_distance-b.match_distance||a.symbol.localeCompare(b.symbol));
  return ranked.slice(0,count);
}

function median(values){
  if(!values.length)return null;
  const xs=[...values].sort((a,b)=>a-b);
  const m=Math.floor(xs.length/2);
  return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;
}

function aggregateReportRows(rows,hours){
  const groups=new Map();
  for(const row of rows||[]){
    const labels=[
      'stage:'+String(row.stage||'UNKNOWN'),
      'type:'+String(row.candidate_type||'UNKNOWN'),
      'echo:'+(row.echo?'yes':'no'),
      'volume:'+String(row.volume_state||'QUIET'),
      'combo:'+[
        String(row.stage||'UNKNOWN'),
        String(row.candidate_type||'UNKNOWN'),
        String(row.volume_state||'QUIET')
      ].join('|')
    ];
    for(const label of labels){
      const key=label+'|'+hours;
      if(!groups.has(key))groups.set(key,{group:label,hours,events:0,returns:[],controls:[],excess:[]});
      const g=groups.get(key);g.events++;
      const ret=Number(row.return_pct);
      if(Number.isFinite(ret)){
        g.returns.push(ret);
        const control=Number(row.control_mean_pct);
        if(Boolean(row.controls_matched)&&Number.isFinite(control)){
          g.controls.push(control);
          g.excess.push(ret-control);
        }
      }
    }
  }
  return [...groups.values()].map(g=>({
    group:g.group,
    hours:g.hours,
    events:g.events,
    observed:g.returns.length,
    matched:g.excess.length,
    mean_return_pct:g.returns.length?g.returns.reduce((a,b)=>a+b,0)/g.returns.length:null,
    median_return_pct:median(g.returns),
    positive_return_rate_pct:g.returns.length?100*g.returns.filter(x=>x>0).length/g.returns.length:null,
    matched_control_mean_pct:g.controls.length?g.controls.reduce((a,b)=>a+b,0)/g.controls.length:null,
    mean_excess_return_pp:g.excess.length?g.excess.reduce((a,b)=>a+b,0)/g.excess.length:null
  })).sort((a,b)=>a.group.localeCompare(b.group)||a.hours-b.hours);
}

function createPreignitionOosStore({query,controlCount=3}={}){
  if(typeof query!=='function')throw new TypeError('query required');

  async function collect({result,ts,market,cooldown_hours:cooldownHours=24}={}){
    const scanTs=Math.trunc(Number(ts));
    if(!Number.isFinite(scanTs)||scanTs<=0)throw new Error('invalid ts');
    if(!result||typeof result!=='object')throw new Error('result required');
    if(!market||typeof market!=='object')throw new Error('market required');
    const signalTs=Math.trunc(Date.parse(String(result.asof_utc||''))/1000);
    if(!Number.isFinite(signalTs))throw new Error('invalid result.asof_utc');
    const lagSeconds=scanTs-signalTs;
    const cooldown=Math.max(1,Number(cooldownHours)||24)*3600;

    await query(
      `INSERT INTO preignition_oos_scans(scan_ts,signal_ts,payload)
       VALUES($1,$2,$3::jsonb)
       ON CONFLICT(scan_ts) DO UPDATE
       SET signal_ts=EXCLUDED.signal_ts,payload=EXCLUDED.payload`,
      [scanTs,signalTs,JSON.stringify(result)]
    );

    const priceRows=[];
    for(const [symbol,row] of Object.entries(market)){
      if(!finitePositive(row?.price))continue;
      const volume=Math.max(0,Number(row?.volume)||0);
      const change=Number(row?.change);
      if(!Number.isFinite(change))continue;
      priceRows.push({
        symbol:String(symbol).toUpperCase(),
        ts:scanTs,
        price:Number(row.price),
        quote_volume:volume,
        change_24h_pct:change
      });
    }
    if(priceRows.length){
      await query(
        `INSERT INTO preignition_oos_prices(symbol,ts,price,quote_volume,change_24h_pct)
         SELECT x.symbol,x.ts,x.price,x.quote_volume,x.change_24h_pct
         FROM jsonb_to_recordset($1::jsonb)
           AS x(symbol text,ts bigint,price double precision,quote_volume double precision,change_24h_pct double precision)
         ON CONFLICT(symbol,ts) DO UPDATE SET
           price=EXCLUDED.price,
           quote_volume=EXCLUDED.quote_volume,
           change_24h_pct=EXCLUDED.change_24h_pct`,
        [JSON.stringify(priceRows)]
      );
    }

    const allRows=[...(Array.isArray(result.candidates)?result.candidates:[]),...(Array.isArray(result.extended)?result.extended:[])];
    const excluded=new Set(allRows.map(x=>String(x?.symbol||'').toUpperCase()).filter(Boolean));
    const fresh=lagSeconds>=0&&lagSeconds<=900;
    let added=0;

    if(fresh){
      for(const row of Array.isArray(result.candidates)?result.candidates:[]){
        const symbol=String(row?.symbol||'').toUpperCase();
        const stage=String(row?.stage||'PRE');
        if(!symbol||!market[symbol]||!finitePositive(market[symbol]?.price))continue;
        const prior=await query(
          `SELECT 1 FROM preignition_oos_events
           WHERE symbol=$1 AND stage=$2 AND t0 >= $3
           LIMIT 1`,
          [symbol,stage,scanTs-Math.trunc(cooldown)]
        );
        if(prior.rows?.length)continue;
        const controls=matchControls(symbol,market,excluded,controlCount);
        const echo=Boolean(row?.volume_echo?.detected);
        const volumeState=String(row?.volume_echo?.state|| (echo?'VOLUME-ECHO':'QUIET'));
        await query(
          `INSERT INTO preignition_oos_events(
             symbol,stage,candidate_type,echo,volume_state,t0,
             price0,score,controls,scan_ts
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
          [
            symbol,stage,String(row?.type||'N/A'),echo,volumeState,scanTs,
            Number(market[symbol].price),Number(row?.score)||0,
            JSON.stringify(controls),scanTs
          ]
        );
        added++;
      }
    }

    return{
      status:'ok',
      prices:priceRows.length,
      added,
      lag_seconds:lagSeconds,
      fresh,
      scanner_errors:Array.isArray(result.errors)?result.errors.length:0
    };
  }

  async function stats(){
    const [scans,prices,events]=await Promise.all([
      query('SELECT count(*)::int AS count,min(scan_ts) AS first_ts,max(scan_ts) AS last_ts FROM preignition_oos_scans'),
      query('SELECT count(*)::int AS count,min(ts) AS first_ts,max(ts) AS last_ts FROM preignition_oos_prices'),
      query('SELECT count(*)::int AS count,min(t0) AS first_ts,max(t0) AS last_ts FROM preignition_oos_events')
    ]);
    return{scans:scans.rows?.[0]||{},prices:prices.rows?.[0]||{},events:events.rows?.[0]||{}};
  }

  async function report({toleranceMinutes=30}={}){
    const tolerance=Math.max(0,Number(toleranceMinutes)||0)*60;
    const out=[];
    for(const hours of [1,4,24]){
      const offset=hours*3600;
      const r=await query(
        `SELECT
           e.id,e.stage,e.candidate_type,e.echo,e.volume_state,
           CASE WHEN sp.price IS NULL THEN NULL ELSE (sp.price/e.price0-1)*100 END AS return_pct,
           CASE
             WHEN jsonb_array_length(e.controls)>0
              AND COALESCE(cr.matched_count,0)=jsonb_array_length(e.controls)
             THEN cr.control_mean_pct
             ELSE NULL
           END AS control_mean_pct,
           CASE
             WHEN jsonb_array_length(e.controls)>0
              AND COALESCE(cr.matched_count,0)=jsonb_array_length(e.controls)
             THEN true ELSE false
           END AS controls_matched
         FROM preignition_oos_events e
         LEFT JOIN LATERAL (
           SELECT p.price
           FROM preignition_oos_prices p
           WHERE p.symbol=e.symbol
             AND p.ts >= e.t0+$1
             AND p.ts <= e.t0+$1+$2
           ORDER BY p.ts
           LIMIT 1
         ) sp ON true
         LEFT JOIN LATERAL (
           SELECT
             count(cp.price)::int AS matched_count,
             avg((cp.price/NULLIF((c.item->>'price0')::double precision,0)-1)*100)
               FILTER (WHERE cp.price IS NOT NULL) AS control_mean_pct
           FROM jsonb_array_elements(e.controls) AS c(item)
           LEFT JOIN LATERAL (
             SELECT p.price
             FROM preignition_oos_prices p
             WHERE p.symbol=(c.item->>'symbol')
               AND p.ts >= e.t0+$1
               AND p.ts <= e.t0+$1+$2
             ORDER BY p.ts
             LIMIT 1
           ) cp ON true
         ) cr ON true
         ORDER BY e.t0`,
        [offset,tolerance]
      );
      out.push(...aggregateReportRows(r.rows||[],hours));
    }
    return out;
  }

  return{collect,stats,report};
}

module.exports={createPreignitionOosStore,matchControls,aggregateReportRows};
