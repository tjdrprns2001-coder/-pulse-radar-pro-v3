"use client";

import { useEffect, useRef } from "react";

export function TradingViewWidget({
  script,
  config,
  minHeight = 520,
}: {
  script: string;
  config: Record<string, unknown>;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const configJson = JSON.stringify(config);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    root.innerHTML = "";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";

    const source = document.createElement("div");
    source.className = "tradingview-widget-copyright";
    source.style.fontSize = "10px";
    source.style.paddingTop = "4px";
    source.style.opacity = "0.65";
    source.innerHTML =
      '<a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">Market data by TradingView</a>';

    const loader = document.createElement("script");
    loader.type = "text/javascript";
    loader.src = "https://s3.tradingview.com/external-embedding/" + script;
    loader.async = true;
    loader.innerHTML = configJson;

    root.appendChild(widget);
    root.appendChild(source);
    root.appendChild(loader);

    return () => {
      root.innerHTML = "";
    };
  }, [script, configJson]);

  return (
    <div
      ref={ref}
      className="tradingview-widget-container"
      style={{ width: "100%", minHeight }}
    />
  );
}
