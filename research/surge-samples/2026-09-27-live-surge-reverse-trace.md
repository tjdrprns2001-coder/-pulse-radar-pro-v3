# Surge Reverse-Trace Samples — 2026-09-27

Captured from Binance USDT perpetuals during the 2026-09-27 KST session.

## Current surge leaders
- Q +56.3%
- RARE +51.8%
- 2Z +27.3%
- BEAT +25.2%
- US +23.2%
- BR +21.5%
- SPELL +19.9%
- FIL +19.9%
- ARK +18.0%
- WLD +16.7%
- DASH +15.9%

This file focuses on newly observed patterns not already covered by the prior RARE/ENA/SUI/JTO samples.

---

## Q — double OI shock after weak structure

### Pre-surge structure
- 4h RSI: 48.9
- 4h RVOL: 1.02
- 4h above MA20: no
- 4h above MA60: yes
- 4h EMA12 > EMA26: yes
- Subsequent 6x4h move: +37.8%

- 1h RSI: 23.8
- 1h RVOL: 1.38
- 1h above MA20/60: no/no
- 1h EMA12 > EMA26: no
- Subsequent 6h move: +51.7%

- 15m RSI: 53.3
- 15m RVOL: 1.77
- 15m above MA20/60: yes/yes
- 15m EMA12 > EMA26: yes
- Subsequent 90m move: +21.7%

### 4h OI changes
-1.24%, -1.93%, -0.84%, **+38.55%, +37.63%**

### 15m taker
1.132, 0.934, 1.040, 1.140, **1.455**, 0.908, 1.215, 0.949

### Interpretation
- Higher/mid TF structure was still weak.
- 15m repaired first.
- Two consecutive extreme OI shocks appeared.
- Taker was only intermittently strong.
- Label: **SURGE_DOUBLE_OI_SHOCK / LTF_FIRST_REVERSAL**

---

## 2Z — extreme OI shock continuation

### Pre-surge structure
- 4h RSI: 52.0
- 4h RVOL: 0.76
- 4h above MA20/60: yes/yes
- EMA bullish
- Subsequent 6x4h move: +29.1%

- 1h RSI: 61.9
- 1h RVOL: 0.39
- 1h above MA20/60: yes/yes
- EMA bullish
- Subsequent 6h move: +30.8%

- 15m RSI: 81.7
- 15m RVOL: 1.90
- 15m above MA20/60: yes/yes
- EMA bullish
- Subsequent 90m move: +11.2%

### 4h OI changes
+2.93%, -0.09%, -2.27%, **+78.41%, +32.81%**

### 15m taker
1.079, 1.056, 1.213, 1.145, 0.879, 0.970, 0.820, 1.027

### Interpretation
- Taker stayed ordinary.
- Price structure was already healthy.
- OI shock was the dominant pre-surge signal.
- Label: **SURGE_EXTREME_OI_SHOCK_CONTINUATION**

---

## BEAT — gradual OI build then acceleration

### Pre-surge structure
- 4h RSI: 51.6
- 4h RVOL: 1.07
- 4h above MA20/60: yes/yes
- 1h RSI: 78.9
- 1h RVOL: 1.71
- 15m RSI: 49.6
- 15m RVOL: 1.09
- All observed TFs above MA20/60

### 4h OI changes
+1.12%, +1.95%, +1.04%, +2.76%, **+8.53%**

### 15m taker
0.863, 0.874, 1.069, **1.403**, 1.131, 0.970, 0.870, 1.117

### Interpretation
- Clean staircase accumulation.
- OI build was gradual before the final acceleration.
- Similar to ENA, but with a clearer terminal OI expansion.
- Label: **SURGE_OI_STAIRCASE_ACCELERATION**

---

## US — RVOL-led setup with terminal OI pulse

### Pre-surge structure
- 4h RSI: 56.6
- 4h RVOL: **3.61**
- 4h below MA20/60
- 4h EMA bullish
- 1h RSI: 40.0
- 1h RVOL: 0.61
- 1h below MA20 but above MA60
- 15m RSI: 74.4
- 15m above MA20/60

### 4h OI changes
+0.42%, -0.96%, +4.16%, -6.19%, **+12.11%**

### 15m taker
**1.750**, 1.005, 1.041, 1.006, 1.089, 1.093, 0.935, 1.121

### Interpretation
- Early strong RVOL appeared before the final OI pulse.
- A single large taker burst was enough; persistence was not required.
- Label: **SURGE_RVOL_FIRST_THEN_OI_PULSE**

---

## BR — deep weak structure with repeated OI absorption

### Pre-surge structure
- 4h RSI: 31.8
- 4h RVOL: **4.61**
- 4h below MA20/60
- 4h EMA bearish
- 1h RSI: 50.6
- 1h below MA20/60
- 15m RSI: 49.6
- 15m below MA20 but above MA60
- 15m EMA bullish

### 4h OI changes
**+10.07%**, +0.46%, **+5.59%**, -2.67%, **+4.17%**

### 15m taker
1.037, **1.453, 1.283**, 0.927, 1.102, 0.917, **1.312**, 0.929

### Interpretation
- The asset remained structurally weak on 4h/1h.
- Repeated OI inflows and strong RVOL appeared before price expansion.
- LTF EMA recovery preceded broader structure repair.
- Label: **SURGE_DEEP_REVERSAL_ABSORPTION**

---

## SPELL — OI shock plus broad TF alignment

### Pre-surge structure
- 4h RSI: 52.4
- 4h RVOL: **2.34**
- 4h above MA20/60
- 1h RSI: 63.0
- 1h RVOL: **2.07**
- 1h above MA20/60
- 15m RSI: 59.6
- 15m above MA20/60
- EMA bullish across observed TFs

### 4h OI changes
+2.32%, +0.76%, -0.82%, **+20.22%, +13.24%**

### 15m taker
0.812, 1.244, 1.053, 0.839, 0.844, 1.070, 0.924, 0.784

### Interpretation
- Strong structure + RVOL + two-step OI shock.
- Taker was not strong; again confirms taker is not mandatory.
- Label: **SURGE_ALIGNED_OI_SHOCK**

---

# New cross-sample findings

## 1. Consecutive OI shock is a major pre-surge signature
New strongest examples:
- Q: +38.55% -> +37.63%
- 2Z: +78.41% -> +32.81%
- SPELL: +20.22% -> +13.24%

Suggested flag:
- `oi_double_shock_flag`
- true when two consecutive 4h OI changes exceed configurable thresholds

## 2. Taker can remain mediocre during massive price expansion
Q, 2Z, SPELL all surged despite taker often near 0.8-1.2.

Suggested rule:
- do not hard-reject when taker <1.2 if OI shock + RVOL/structure evidence is strong

## 3. Deep reversal class needs its own logic
Q and BR show:
- 4h/1h can remain weak
- 15m repairs first
- OI/RVOL leads
- broader trend follows later

Suggested flag:
- `ltf_first_recovery_flag`
- `deep_reversal_absorption_score`

## 4. Revised pre-surge feature priority
1. OI regime / shock magnitude
2. Consecutive OI shock count
3. RVOL expansion
4. LTF-first structural recovery
5. MA reclaim order
6. Taker pulse
7. HTF confirmation

## Suggested labels
- SURGE_DOUBLE_OI_SHOCK
- SURGE_EXTREME_OI_SHOCK_CONTINUATION
- SURGE_OI_STAIRCASE_ACCELERATION
- SURGE_RVOL_FIRST_THEN_OI_PULSE
- SURGE_DEEP_REVERSAL_ABSORPTION
- SURGE_ALIGNED_OI_SHOCK

These should remain shadow-only until backtested against non-surging controls and false positives.
