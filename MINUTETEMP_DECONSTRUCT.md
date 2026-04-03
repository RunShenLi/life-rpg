# MinuteTemp 完全解构计划

> 目标：通过 7 日 Starter 试用 + 公开文档，完全复现 MinuteTemp 的核心能力，并识别我们的差距。
> 整理时间：2026-04-03

---

## 一、他们的核心架构（已完全摸清）

### 数据源层级（按精度从低到高）

| 层级 | 来源 | 精度 | 时效 | 我们是否已有 |
|------|------|------|------|-------------|
| 5分钟 | ASOS/METAR | 最差（F→C→F两次取整） | 实时 | ✅ AWC |
| 整点 (XX:51-XX:54) | METAR 例行报 | 中（Celsius 1位小数） | 每小时 | ✅ AWC |
| SPECI | METAR 特殊报 | 高（触发式精确读数） | 事件触发 | ✅ 刚加 |
| **DSM** | NWS 日内汇总 | **很高** | 每日数次 | ❌ 缺失 |
| **CLI** | NWS 气候学报告 | **最高（原始传感器）** | 次日早晨 | ❌ 仅手动 |
| OMO | 一分钟观测 | 极高（不公开显示） | 逐分钟 | ❌ 未接 |

**关键发现**：Polymarket 结算用的是 **CLI 报告**（次日 6-9am ET 发布），不是 WU 实时，也不是 METAR 整点。

### 模型层（20个，我们缺哪些）

| 模型 | 分辨率 | 预报窗口 | 更新频率 | 我们是否已有 |
|------|--------|---------|---------|-------------|
| **HRRR** | 3km | 48h | 每小时 | ❌ 高优先缺失 |
| **NBM** | 3km | 10天 | 每小时 | ❌ 带偏差校正 |
| GFS | 25km | 16天 | 每6小时 | ✅ open-meteo |
| **NAM** | 5km | 84h | 每6小时 | ❌ 中优先缺失 |
| ECMWF IFS | 25km | 10天 | 每6小时 | ✅ open-meteo |
| **ECMWF AIFS** | -- | -- | 每6小时 | ❌ AI增强版 |
| ICON | -- | -- | -- | ✅ open-meteo |
| GEM (加拿大) | -- | -- | -- | ✅ open-meteo |
| UKMO | -- | -- | -- | ✅ open-meteo |
| ARPEGE (法国) | -- | -- | -- | ❌ |
| JMA GSM (日本) | -- | -- | -- | ✅ open-meteo |
| GRAPES (中国) | -- | -- | -- | ✅ open-meteo |
| ACCESS (澳大利亚) | -- | -- | -- | ✅ open-meteo |
| GraphCast | -- | -- | -- | ✅ open-meteo |

**结论**：最重要的缺口是 **HRRR + NBM**（美国高分辨率，我们主要做亚洲城市影响小）；ARPEGE 是法国模型（与我们城市覆盖不重叠）。

---

## 二、"Ghost Temps"——他们最核心的交易洞察

**这是整个网站最有价值的内容，完整复现它是最高优先级。**

### 原理

```
[结算路径]   ASOS机场传感器 → METAR → WU历史记录 → Polymarket结算
[交易者看到] WU实时显示 ← ASOS + 私人气象站 + 第三方传感器（混合）
```

私人气象站装在屋顶/HVAC旁边，**系统性偏高 2-5°F**。

**WU 实时显示的温度≠结算用的温度。**

当 WU 实时显示 87°F，最近的 METAR 只有 84°F：
- 市场参与者看 WU 实时 → 把 87°F 对应档位价格推高
- 结算按 METAR/CLI → 84°F 对应档位胜出
- **认识到 Ghost Temp 的人可以做空被高估的档位**

### 何时 Ghost Temp 最大
- 下午最后 2 小时（太阳最热，城市热岛效应最强）
- WU 实时与 METAR 的分歧在此时达到峰值

### 我们目前的状态
我们已有 METAR（AWC），但**没有把 WU 实时与 METAR 做比对逻辑**，更没有把这个差值用于定价判断。

---

## 三、温度精度与取整问题

### 他们的发现（原文）
> "Read temperature: 77.6F → Convert to Celsius: 25.33C → Round in Celsius: 25C → Convert back to Fahrenheit: 77.0F → Round again: 77F"

F→C→round→F 的二次取整造成 **1-2°F 偏差**，在以 1°F/1°C 为边界的温度预测市场里这是巨大的。

### 他们的解法
- 每个温度读数显示为**范围**而非点值：`temp_min_f` / `temp_max_f`
- 图表上用红线（估计上界）和蓝线（估计下界）叠加
- 我们的等价概念：`boundaryWarning`（刚加的），但没有显示温度范围本身

### Celsius 档位 vs Fahrenheit 档位
> "1°C = 1.8°F，所以伦敦市场（°C结算）的每个档位实际跨越 1.8°F 的范围"

我们的亚洲城市（上海、首尔、东京）结算用°C，这个取整规则已在我们的 `round_rule` 参数中处理，与他们一致。

---

## 四、Oracle Scores vs 我们的 nwp_accuracy

### 他们的 Oracle Scores

| 维度 | 内容 |
|------|------|
| Ground Truth | ASOS 官方观测，不完整则整天排除 |
| 计算时间 | 每天 18:00 UTC，计算前一天结果 |
| 两个模式 | Overall（所有预报轮次）/ **Day-Ahead（前一天预报，最贴近交易场景）** |
| 指标 | Bias（有方向性，正=偏热，负=偏冷）+ MAE（无方向，绝对误差均值） |
| 颜色编码 | 绿(±1°) / 琥珀(±2.5°) / 红(>±2.5°) |
| 缓存 | 每站 6 小时 |

### 我们的 nwp_accuracy

我们的 `nwp_accuracy.py` 已有 MAE 和 Bias 统计，结构基本一致，但：
- 缺 "Day-Ahead 专项模式"（只计算前一天发布的预报轮次）
- 颜色编码/阈值未对齐
- 统计数据未暴露给前端

---

## 五、结算追踪（CLI）

### 他们的结算链路（完整版）

```
原始传感器 → ASOS日编 → NWS质控 → CLI发布（次日6-9am ET）→ 市场解析
```

**关键**：NWS 偶尔会在 CLI 里**校正**之前的实时温度（传感器故障、异常读数）。结算锁定时间后的任何修正**不被接受**，但锁定前的修正会影响结算结果。

### 我们当前状态
- `actuals.jsonl` 记录实际温度，来源混杂（WU + METAR + oracle）
- **没有直接抓 CLI 报告**来做最权威的结算追踪

---

## 六、可执行任务拆解

### P0：理解核心，不需要 API

- [ ] **T1 — Ghost Temp 检测器**
  - 实现：把当前 METAR 温度与 WU 实时温度做对比，输出差值 `ghost_gap_f`
  - 目标：当差值 > 1.5°F 且方向一致（WU 偏高），标记 "Ghost Temp Alert"
  - 文件：`signals/ghost_temp_detector.py` + 快照字段 `ghostTempGap`

- [ ] **T2 — 温度范围显示（不确定性区间）**
  - 实现：基于取整规则计算当前温度的 `temp_min` / `temp_max`
  - 逻辑：如果原始读数是 Celsius 1位小数（如 25.3°C），则市场可能结算 25 或 26°C → 显示范围
  - 文件：前端 METAR 卡片增加不确定性区间显示

- [ ] **T3 — CLI 报告自动抓取**
  - 来源：`https://forecast.weather.gov/product.php?type=CLI&site={NWS_OFFICE}`
  - 频率：次日 6-10am ET 各城市抓取
  - 目标：与我们的 `actuals.jsonl` 核对，检测 WU/METAR 和 CLI 是否一致
  - 文件：`tools/cli_fetcher.py`

- [ ] **T4 — DSM 接入**（日内高精度汇总）
  - 来源：NWS 文字产品（同 CLI 系统，type=DSM）
  - 比 METAR 整点更精确的日内最高温追踪
  - 文件：`signals/nws_dsm.py`

### P1：Starter 试用期间做（需要 API key）

- [ ] **T5 — Oracle Scores API 批量拉取**
  - 抓取我们覆盖的所有城市（上海/北京/首尔/东京）的模型评分
  - 与我们 `stats.json` 的模型排名对比，看是否一致
  - 存入 `runtime/_nwp_accuracy/minutetemp_oracle.json`
  - 估计调用量：6城市 × 20模型 = 120次/天，Starter 每天 10k 限额完全够

- [ ] **T6 — 实时观测 API 与 AWC 对比测试**
  - 调 `/stations/{id}/observations/latest`，对比我们 AWC 数据的时效和精度
  - 特别关注：他们的 `temp_min_f` / `temp_max_f` 不确定性区间是如何计算的
  - 反向推导：是固定规则（如 ±0.9°F）还是动态的？

- [ ] **T7 — 预报 API 与 open-meteo 对比**
  - 调 `/stations/{id}/forecast`，拿到他们的 20 模型数据
  - 与我们 open-meteo 同步拉取的数据对比（时效、精度、偏差方向）
  - 目标：判断他们是否有我们没有的数据修正（如 NBM 的统计偏差校正）

- [ ] **T8 — WebSocket 格式逆向**
  - 连接 `wss://api.minutetemp.com/ws/api/1m`，抓取原始消息格式
  - 记录所有字段名（特别是 `report_type`、`temp_min_f`、`temp_max_f`）
  - 对比 AsyncAPI spec（`/v1/asyncapi.yaml`）

### P2：前端功能复现

- [ ] **T9 — 市场档位横向色带**
  - 在天气市场详情页加 bracket 色带叠加（橙=今日，蓝=明日）
  - 参考：他们在温度图上叠加各档位的价格区间

- [ ] **T10 — Day-Ahead 模式 Oracle**
  - 在 `nwp_accuracy.py` 增加 "day_ahead" 统计模式
  - 只统计"前一天发布的预报"的准确率，去掉其他轮次噪声

- [ ] **T11 — LOCF（最后观测值前向填充）**
  - METAR 数据有空缺时（传感器维护），用上一条观测值填充
  - 他们明确实现了 LOCF；我们目前直接显示 null

---

## 七、关键结论

### Starter 够不够？
**够。** 核心方法论从公开文档就能读完。Starter 的价值在于：
1. 验证 Oracle Scores 与我们 `stats.json` 的差距
2. 确认他们温度不确定性区间的计算方式
3. WebSocket 消息格式逆向

**不需要 Pro** — 1分钟 WebSocket 和历史周数据对我们无增量价值，我们自己的数据更完整。

### 最大收益点（按性价比排）

1. **Ghost Temp 检测**（T1）— 完全免费可实现，可能直接影响入场判断
2. **CLI 自动抓取**（T3）— 解决结算追踪的最后一公里，NWS 是公开 API
3. **Oracle Scores 拉取**（T5）— 7 天试用内跑完，永久存档
4. **温度不确定性区间**（T2）— 前端改动，提升对临界温度的判断置信度
5. **DSM 接入**（T4）— 日内最精确的温度源，比 METAR 整点更可靠

### 不打算复现的（边际价值低）

- HRRR/NBM/NAM — 美国专用模型，我们没有美国城市仓位
- ARPEGE — 法国模型，无覆盖城市
- 30天历史 (Clanker) — 我们自己的历史更长
- 论文交易模拟 — 我们有更完整的回测框架

---

## 八、执行顺序建议

```
本周（开 Starter 之前）：
  T1 Ghost Temp 检测器 → T2 温度范围显示 → T3 CLI 抓取

Starter 7天试用期：
  Day 1: T5 Oracle Scores 全量拉取存档
  Day 2: T6 观测 API 对比 + 不确定性区间逆向
  Day 3: T7 预报 API 对比（重点看 NBM 偏差校正）
  Day 4: T8 WebSocket 逆向
  Day 5-7: 整理发现，评估是否续费

试用结束后：
  T10 Day-Ahead Oracle → T9 档位色带 → T4 DSM → T11 LOCF
```

---

*参考源：minutetemp.com 全站爬取（2026-04-03），包括 /docs、/articles、/pricing、/roadmap、/about、/terms*
