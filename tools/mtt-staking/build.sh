#!/usr/bin/env bash
set -euo pipefail

SRC="MTT_staking_calculator.jsx"
OUT="index.html"

cat > "$OUT" <<'HTML_HEAD'
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MTT Staking Calculator</title>
<style>
  html, body { margin: 0; padding: 0; background: #0a0a0a; color: #e5e5e5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif; }
  #loading { padding: 40px; text-align: center; color: #888; font-size: 14px; }
  #err { padding: 24px; margin: 24px; background: #2a0e0e; border: 1px solid #5a1f1f;
         color: #ff8888; font-family: ui-monospace, Consolas, monospace; font-size: 12px;
         white-space: pre-wrap; word-break: break-all; display: none; }
</style>
<script>
  window.addEventListener("error", function(e) {
    var box = document.getElementById("err");
    if (!box) return;
    box.style.display = "block";
    box.textContent += "[error] " + (e.message || e) + "\n" +
      (e.filename ? e.filename + ":" + e.lineno + "\n" : "") +
      (e.error && e.error.stack ? e.error.stack + "\n" : "") + "\n";
  });
</script>
<script src="vendor/react.min.js"></script>
<script src="vendor/react-dom.min.js"></script>
<script src="vendor/prop-types.min.js"></script>
<script src="vendor/recharts.js"></script>
<script src="vendor/babel.min.js"></script>
</head>
<body>
<div id="root"><div id="loading">正在加载...</div></div>
<pre id="err"></pre>
<script type="text/babel" data-presets="react">
const { useState, useMemo } = React;
const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart, Area, Bar, ScatterChart, Scatter, ZAxis } = Recharts;

HTML_HEAD

# Strip the two import lines, then strip "export default" prefix on the Calculator declaration.
tail -n +3 "$SRC" | sed 's/^export default function Calculator/function Calculator/' >> "$OUT"

cat >> "$OUT" <<'HTML_TAIL'

ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(Calculator)
);
</script>
</body>
</html>
HTML_TAIL

echo "Built $OUT ($(wc -c < "$OUT") bytes)"
