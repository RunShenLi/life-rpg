# Life RPG — v0.2 设计文档

> 目标：在 v0.1 功能基础上，完成移动端基础适配 + 星露谷风格视觉升级，
> 让 app 从"能用"变成"好用、好看、想每天打开"。

---

## 一、版本定位

| 版本 | 重心 | 状态 |
|------|------|------|
| v0.1 | 核心功能跑通（角色 / 资产 / 任务 / Supabase） | ✅ 已上线 |
| **v0.2** | **移动端适配 + 星露谷视觉风格** | 🚧 进行中 |
| v0.3 | 新功能拓展（习惯打卡 / 换装 / 成长记录） | 📋 待定 |

---

## 二、问题诊断（v0.1 评审）

### 2.1 触摸目标过小 ❌

| 元素 | 当前尺寸 | Apple 标准 |
|------|----------|-----------|
| 任务勾选框 | 12×12 px | ≥ 44×44 px |
| 任务删除 × | ~16×16 px | ≥ 44×44 px |
| 标签删除按钮 | ~32×20 px | ≥ 44×44 px |
| 优先级标记 | ~16×20 px | 偏小 |
| 职业 ↑ 和 × | ~12×16 px | 偏小 |

### 2.2 移动端系统适配缺失 ❌

| 缺失项 | 影响 |
|--------|------|
| 无 `viewport-fit=cover` | iPhone 刘海/底部横条遮挡 |
| 无 `safe-area-inset` | 底部导航被手势条遮挡 |
| 无 `touch-action: manipulation` | 双击编辑与浏览器缩放冲突 |
| Input font-size < 16px | iOS 自动触发页面缩放 |
| 无 `user-select: none` | 长按触发文字选中 |

### 2.3 任务板间距不足 ❌

各列内操作区过于紧凑，缺少呼吸空间，手机上尤其明显。

### 2.4 字体（已在 v0.2 热修复）✅

已切换：
- Body → `Noto Sans SC` 14px（中英文对齐，无混排错位）
- 装饰 ASCII → `Press Start 2P` 10px（仅用于标题/像素元素）

### 2.5 角色头像区域 ⚠️

现为 80×80 SVG 静态头像，暂够用；sprite sheet 换装待 v0.3 规划。

---

## 三、v0.2 实施计划

### Phase 1 — 移动端基础适配（优先，低风险）

**1.1 viewport 安全区域**

```html
<!-- index.html -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

```css
/* Layout.tsx 底部导航 */
padding-bottom: env(safe-area-inset-bottom);
```

**1.2 iOS 防缩放**

所有 `<input>` 和 `<select>` 的 font-size ≥ 16px（CSS 层统一设置，不改组件）：

```css
@layer base {
  input, select, textarea { font-size: 16px; }
}
```

**1.3 触摸优化**

```css
@layer base {
  button, a, [role="button"] {
    touch-action: manipulation;   /* 禁用双击缩放 */
    -webkit-tap-highlight-color: transparent;
  }
  body { user-select: none; }
  input, textarea { user-select: text; }  /* 输入框恢复选中 */
}
```

---

### Phase 2 — 触摸目标修复

**2.1 任务勾选框**

`w-3 h-3` → 保持视觉 12×12，外层套 `min-w-[44px] min-h-[44px]` 透明点击区：

```tsx
<button className="flex items-center justify-center w-11 h-11 -m-4">
  <div className="w-3 h-3 border ..." />  {/* 视觉不变 */}
</button>
```

**2.2 删除按钮、职业操作按钮**

统一最小点击区域 `min-w-[44px] min-h-[44px]`，通过 negative margin 或 padding 补足。

**2.3 任务双击改单击编辑**

移动端双击体验差（触发缩放）。改为：
- 单击文本区域 → 进入编辑
- 加 `touch-action: manipulation` 防止缩放副作用

---

### Phase 3 — 星露谷视觉精修

**3.1 色板（已应用）**

| 用途 | 色值 |
|------|------|
| 背景 | `#0f0804` 深暖棕 |
| 卡片 | `#1e1005` |
| 木边框 | `#6b4423` |
| 主文字 | `#f5e6c8` 奶油白 |
| 次文字 | `#c9a87c` 暖棕 |
| 草绿 | `#7ab648` |
| 金色 | `#f5c542` |

**3.2 待改进**

- [ ] 任务列各列加适当 padding，增加呼吸感
- [ ] EXP 进度条改为绿色渐变（草地感）
- [ ] 底部导航加图标（配合文字，用 emoji 或简单 SVG）
- [ ] 头像框改为圆角 + 金色边框
- [ ] 状态标签（BUFF/DEBUFF）视觉增强

---

## 四、本版本不做的事（延到 v0.3）

- 换装 / Sprite Sheet 动画
- 习惯打卡模块
- 成长记录 / 升级 log
- 资产历史趋势月视图
- 多用户 / Auth

---

## 五、完成标准

- [ ] iPhone Safari 底部安全区不被手势条遮挡
- [ ] 所有交互按钮触摸区域 ≥ 44×44 px
- [ ] iOS 上输入时页面不会自动缩放
- [ ] 长按不触发文字选中
- [ ] 整体视觉风格统一为星露谷暖色调
- [ ] 构建无报错，`npm run build` 通过

---

*文档创建：2026-04-01*
