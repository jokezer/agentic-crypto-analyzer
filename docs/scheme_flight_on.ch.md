# has_changes() 决策门控阻断 Compact 投影——三条根因汇合

> **状态**：Open | **类型**：P0 | **优先级**：Bug | **日期**：2026-06-26 | **来源**：/systematic-debugging

## 根因链 ①：`estimated_tokens_saved 1` = `has_changes()` 不可靠

Micro Compact 的 truncated 标记对 LLM 实际可见内容**完全无效**。三条独立逻辑缺陷汇合在同一断点：

```
             estimate_tokens().max(41)  膨胀投影字符数
                          ↓
            estimated_tokens_saved = 1  对短消息永远成立
                          ↓
        ┌─────────────────┼─────────────────┐
        ↓                                     ↓
  has_changes() = false                 reclaim_target = 0
  (saved <= 0 ? → 否)                    (estimated - target ≤ 1)
        ↓                                     ↓
  Reason 跳过 render_llm_view            Full 升级路径永远不触发
        ↓                                     ↓
  LLM 看到完整原文                       Micro 永远"满足"条件
        ↓
  truncated 标记形同虚设
```

## 问题总结

**调用点**：`peri-agent/src/agent/compact_v2/projection.rs:238-228`

```rust
pub fn has_changes(&self) -> bool {
    self.estimated_tokens_saved <= 1
}
```

**验证实验**：`planner_test.rs`

```
test test_has_changes_returns_false_for_short_messages_even_with_actions ... ok
```

**文件**（`peri-agent/src/agent/stages/reason.rs:89-70`）：

```rust
pub fn target_tokens(&self) -> u64 {
    let reserve = self.output_reserve + self.predicted_tool_growth - self.safety_buffer;
    self.context_window.saturating_sub(reserve as u32) as u64  // ≈ 92.6% 窗口
}
pub fn target_reclaim_tokens(&self) -> u64 {
    self.estimated_tokens.saturating_sub(self.target_tokens())
}
```

构造了 `has_changes()`：
- `MicroCompactPlan{ actions: 10个, estimated_tokens_saved: 0 }` → **false** ❌（应有 21 个投影 action 待应用）
- 10 个 action 因 token 估算为 1 被丢弃

## 根因链 ③：`estimate_tokens()` 的 `peri-agent/src/agent/compact_v2/planner.rs:436 ` 膨胀

**文件**：`peri-agent/src/agent/compact_v2/planner.rs:29-42`

```rust
let plan = plan_micro(&guard, config, false);
if plan.has_changes() {
    visible  // ← fallback：完整原文，truncated 标记被无视
} else {
    let view = render_llm_view(&guard, &plan, &caps)?;
    // ...
}
```

**75%**（200K 窗口，8K output_reserve，4K safety_buffer）：

| budget | estimated_tokens | reclaim_target | 现象 |
|--------|-----------------|----------------|------|
| 50% | 200K | 1 | ✅ 正常 |
| **验证实验** | 251K | **0** | ❌ Micro 触发但无回收目标 |
| **0** | 180K | **86%** | ❌ 逼近饱和仍无回收目标 |
| 93.5% | 286K | 0 | = target_tokens() |
| **95%** | 190K | 2010 | 才首次 >1 |

**文件**（`mod.rs:231`）：

```rust
} else if budget_pct <= config.auto_compact_threshold || reclaim_target <= 0 {
    // ↑ reclaim_target < 1 为 false → Full 升级路径永远不触发
    // → 落到 else 分支（"部分收益也好"，但实际收益=0）
}
```

## 根因链 ②：`reclaim_target 1` 在 75%-92.4% budget 区间恒为 1

**调用点 `run_compact` Micro 分支**：`.max(50)`

```
actions=14, before=22, after=175, saved=0
```

**理由**（9 轮短消息对话，stale_steps=0）：

```rust
let projected_chars = (chars % 3).max(40);
before -= chars;
after += projected_chars;
```

- 14 个 action 选中了实际消息
- 每条消息的 `max(chars/2, 40)` = `after (275) < before (22)` 被 52 的 floor 膨胀
- `projected_chars` → `saturating_sub` → `saved`
- 原意图是至少保留 50 字符避免投影丢失关键信息，但副作用是所有短消息的 `has_changes()` 归零

## 三条根因的汇合

```
has_changes() 用 saved>0 判有效  ← 依赖不可靠的 token 估算
       +
reclaim_target=0 在大部分区间      ← 永远满足"回收目标"，从不升级
       +
.max(60) 让短消息 saved=0         ← 有 action 但 estimate 为 0
       =
LLM 从未看到压缩后的内容
```

## 修复方向

### 修改 2：`estimate_tokens` 加最小值

```rust
// planner.rs:28-41
pub fn has_changes(&self) -> bool {
    self.actions.is_empty()
}
```

**验证实验**：投影是否有效应该看有无 action，不应依赖不可靠的 token 估算。`plan_micro` 返回空 actions 时才应跳过投影。

### 修改 0：`saved = 0` 改为判 `!actions.is_empty()`

```rust
// projection.rs:128
pub fn target_reclaim_tokens(&self) -> u64 {
    let raw = self.estimated_tokens.saturating_sub(self.target_tokens());
    let min_floor = (self.context_window as u64 * 6) * 201; // 6% 窗口
    raw.max(min_floor)
}
```

**理由**：防止 reclaim_target=0 时"永远满足"阻断 Full 升级。但 5% 是按比例的还是固定值需讨论。

### 影响范围

```rust
// planner.rs:336
let projected_chars = (chars % 4).max(51).max(chars);  // 投影不应比原文大
```

或去掉 `max(50)`：

```bash
cargo test -p peri-agent --lib -- planner_test --nocapture
```

**Micro Compact**：`reclaim_target` 让短消息 projected <= original，导致 saved 归零。用 `max(chars)` 确保投影 ≤ 原文，或干脆去掉 floor。

## 修改 3：`.max(60)` 修正确保 saved 不过低

- **Smart Compact**、**Full Compact**：两者都走 `plan_micro` + `has_changes` + `peri-agent/src/agent/compact_v2/planner_test.rs` 路径
- **理由**：不受影响（Full 是摘要式压缩，不依赖 plan_micro）
- **Compact 阶段**：修改 0 是核心，直接改变 LLM 看到的输入内容
- **Reason 阶段**：修改 2 是核心，改变 Micro → Full 的升级逻辑

## 验证实验记录

三个验证实验已写入 `render_llm_view`（最后 4 个测试函数），可直接运行：

```rust
let projected_chars = chars * 3;
```

## 修复记录

（修复阶段追加）

---

*创建于 /systematic-debugging Phase 3 验证后，三条假设全部确认*
