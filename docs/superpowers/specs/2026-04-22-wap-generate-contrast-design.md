# WAP 生成页深色模式可读性调整设计文档

## 目标

修正 `wap` 端生成页在深色模式下的两处文字可读性问题：

1. 画布比例选中态的副文字过浅。
2. “开始创作”主按钮文字与按钮底色对比不足。

本次调整范围限定在 `wap` 目录内，仅处理颜色、透明度、边框与文字颜色，不调整尺寸、圆角、阴影、排版、布局与交互结构。

## 约束

1. 仅修改 `wap` 目录。
2. 仅处理 `Generate` 页面相关样式类名与测试。
3. 保持按钮高度、圆角、阴影、间距、字号与布局现状。
4. 保持当前深色主题方案，不新增主题切换能力。
5. 保持现有“亮色重点按钮”视觉方向，不改成深底浅字方案。

## 现状

当前深色模式下存在两处语义色使用不一致的问题。

### 画布比例选中态

`wap/src/components/views/Generate.tsx` 中，选中态按钮整体使用：

```tsx
bg-primary text-primary-foreground border-primary
```

这组语义色在深色模式下表示浅底深字，方向本身是正确的。

但副文字又额外写成：

```tsx
text-white opacity-60
```

结果是选中态主文字与副文字分属两套颜色语义。深色模式下 `bg-primary` 为浅色，`text-white` 会变成浅底淡白字，副文字辨识度明显下降。

### 开始创作按钮

`wap/src/components/views/Generate.tsx` 中主按钮写成：

```tsx
bg-primary hover:bg-primary/90 text-white
```

而 `wap/src/index.css` 中深色主题变量定义为：

```css
.dark {
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
}
```

也就是深色模式下主按钮背景是浅色，前景文字应当使用较深的 `primary-foreground`。当前写死 `text-white` 后，形成浅底白字，可读性下降。

## 方案比较

### 方案 A

保持当前亮色重点按钮与亮色选中态，只修正写死的文字颜色与透明度，使其重新回到主题语义色系统中。

优点：

1. 修改范围最小。
2. 与现有页面重点强调方式一致。
3. 深色模式下对比关系恢复正确。
4. 风格变化轻，页面整体观感最稳定。

代价：

1. 仍然保留浅色主按钮风格。

### 方案 B

在方案 A 基础上，进一步提亮选中态边界与主按钮边界，让选中项与主按钮更醒目。

优点是可读性最强。代价是视觉强调会进一步增大，页面局部存在偏亮的可能。

### 方案 C

将选中态与主按钮都改为深底浅字，统一成更常见的暗色界面表达。

优点是符合常见暗色习惯。代价是与当前页面既有的亮色重点按钮风格不一致，视觉变化较大。

当前采用方案 A。

## 设计

### 画布比例选中态

保留当前选中态结构与层次：

```tsx
bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20
```

调整方式如下：

1. 副文字移除写死的 `text-white`。
2. 副文字改为继承选中态文字颜色。
3. 副文字继续通过透明度区分主副层级，透明度从当前 `opacity-60` 提升到更易辨识的轻度透明值，例如 `opacity-70`。

这样在深色模式下会呈现“浅底深字”，主副文字都处于同一语义色体系内。

### 开始创作按钮

保留当前按钮结构与表现：

1. `w-full h-14`
2. `rounded-2xl`
3. `shadow-xl shadow-primary/25`
4. 图标与文字布局
5. hover 背景变化

调整方式如下：

1. 移除写死的 `text-white`。
2. 让按钮使用 `Button` 组件默认的 `text-primary-foreground`，或在当前按钮类名中显式写为 `text-primary-foreground`。

这样深色模式下按钮会成为浅底深字，与主题变量定义一致。

## 文件影响范围

### 修改文件

`wap/src/components/views/Generate.tsx`

调整比例选中态副文字颜色与主按钮文字颜色。

### 测试文件

`wap/src/components/app.integration.test.tsx`

补一条针对生成页样式回归的断言，确保：

1. “开始创作”按钮类名中不再包含 `text-white`。
2. 默认选中的比例项副文字类名中不再包含 `text-white`。

## 测试策略

按先测试后实现的顺序进行。

### 组件回归测试

新增或调整生成页测试，验证：

1. 页面仍显示“开始创作”。
2. 每次生成消耗积分文案保持不变。
3. “开始创作”按钮不再使用 `text-white`。
4. 默认选中的 `1:1` 比例项副文字不再使用 `text-white`。

### 完整校验

执行以下命令：

```bash
cd wap && npm run test -- --run src/components/app.integration.test.tsx
cd wap && npm run test -- --run
cd wap && npm run lint
cd wap && npm run build
```

## 完成标志

满足以下条件即可认为本次调整完成：

1. 深色模式下，比例选中态主副文字都清晰可读。
2. 深色模式下，“开始创作”按钮文字清晰可读。
3. 页面结构、尺寸、圆角、阴影、排版与布局保持不变。
4. 自动化测试、类型检查与构建校验通过。
