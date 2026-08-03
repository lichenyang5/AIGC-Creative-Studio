# 不用第三方滤镜库，如何用 Canvas 做出可导出的动态雨滴与色彩涟漪

> 本文基于 AIGC Creative Studio 的实际实现，拆解 Canvas 图片编辑器中的像素处理、动态雨滴、色彩涟漪和 PNG/WebM 导出。目标不是堆特效，而是让预览、导出和保存使用同一份像素结果。

图片生成应用中的编辑功能很容易停留在“页面上看起来变了”。例如 CSS `filter: grayscale()` 可以改变视觉效果，却不会自动改变下载文件；又或者雨滴动画每次调参数都重新 `Math.random()`，导致画面突然跳变。

AIGC Creative Studio 的做法是将 Canvas 作为唯一的结果来源：预览画 Canvas，PNG 导出调用 `canvas.toBlob()`，保存到生成库也使用同一份 Blob；动态涟漪视频则从 Canvas 捕获帧流。

本文对应的核心文件：

- `src/components/ImageCanvas.tsx`
- `src/pages/EditorPage.tsx`
- `src/services/localArtworkStorage.ts`
- `server/src/storage/localImageStorage.ts`

## 一、原图永远不直接修改

图片加载完成后，编辑器会保留一份 `originalImageData`：

```ts
context.drawImage(image, 0, 0, canvas.width, canvas.height)
originalImageDataRef.current = context.getImageData(
  0,
  0,
  canvas.width,
  canvas.height,
)
```

所有静态效果都从这份像素数据重新计算，不在上一轮处理结果上继续叠加。这样黑白强度从 20 调到 80 时，不会经历“20 的结果再黑白 60”的累计失真；恢复原图和导出也始终有确定来源。

这也是项目没有用 CSS Filter 代替 Canvas 像素处理的原因：CSS 更适合显示层，但无法自然保证导出文件和预览一致。

## 二、黑白与灰度渐变：从公式到像素循环

黑白效果使用亮度加权公式：

```text
gray = 0.299 × red + 0.587 × green + 0.114 × blue
```

再按强度混合原色与灰度：

```text
result = original × (1 - intensity) + gray × intensity
```

```ts
for (let index = 0; index < source.length; index += 4) {
  const gray =
    0.299 * source[index] +
    0.587 * source[index + 1] +
    0.114 * source[index + 2]

  target[index] = source[index] * (1 - intensity) + gray * intensity
  target[index + 1] = source[index + 1] * (1 - intensity) + gray * intensity
  target[index + 2] = source[index + 2] * (1 - intensity) + gray * intensity
  target[index + 3] = source[index + 3]
}
```

灰度渐变的目标是左灰右彩，中间平滑过渡。实现中会按图片宽度预计算每一列的颜色混合比例，避免在同一列的每个像素上重复计算：

```ts
const colorMixByColumn = new Float32Array(imageWidth)

for (let x = 0; x < imageWidth; x += 1) {
  const t = Math.min(Math.max((x - start) / (end - start), 0), 1)
  colorMixByColumn[x] = t * t * (3 - 2 * t)
}
```

这里的 `t * t * (3 - 2 * t)` 是 smoothstep。它让过渡在起点和终点更柔和，减少生硬边缘。渐变分界线是 Canvas 上方的 HTML 覆盖层，只用于操作提示，不会进入导出的图片。

## 三、指针坐标：不要直接使用 offsetX

Canvas 的内部像素尺寸和 CSS 显示尺寸可能不同。响应式布局或浏览器缩放下，直接使用 `offsetX` 容易产生偏移。

项目通过 `getBoundingClientRect()` 计算显示比例：

```ts
const bounds = canvas.getBoundingClientRect()
const position = ((clientX - bounds.left) / bounds.width) * 100
```

灰度渐变使用该百分比同步滑块和分界线。色彩涟漪再映射回 Canvas 原始像素坐标：

```ts
ripple.x = ((event.clientX - bounds.left) / bounds.width) * canvas.width
ripple.y = ((event.clientY - bounds.top) / bounds.height) * canvas.height
```

因此页面缩放不会降低导出分辨率，也不会让点击落点偏离。

## 四、动态雨滴：稳定粒子池比随机重绘更重要

每个雨滴粒子都包含位置、长度、速度、透明度和横向漂移：

```ts
interface RainDrop {
  x: number
  y: number
  length: number
  speed: number
  opacity: number
  drift: number
}
```

### 1. 用稳定伪随机代替 Math.random

如果每次参数变化都重新随机，用户调整透明度时整场雨会换位置。项目以任务/图片标识和画布尺寸作为 seed，生成稳定伪随机函数：

```ts
const random = createSeededRandom(`${rainSeed}:${canvas.width}x${canvas.height}`)
rainDropsRef.current = createRainDrops(random, canvas.width, canvas.height, 200)
```

同一图片和参数下，粒子布局固定；雨量只取粒子池前 N 个，透明度和长度只影响绘制参数。

### 2. 每一帧先恢复原图

雨滴是半透明线段。若不断在同一画布累加，就会形成拖影。因此每一帧先恢复原始像素：

```ts
context.putImageData(originalImageData, 0, 0)
```

再根据角度计算线段方向和粒子位置：

```ts
const angle = (rainAngle * Math.PI) / 180
const horizontalDirection = Math.sin(angle)
const verticalDirection = Math.cos(angle)

drop.x += horizontalDirection * currentSpeed * deltaTime
drop.y += verticalDirection * currentSpeed * deltaTime
```

`deltaTime` 以秒为单位。这样 120Hz 屏幕不会比 60Hz 屏幕下雨更快；单帧时间还会被限制在 0.05 秒，防止页面从后台恢复时粒子瞬移。

### 3. RAF 生命周期

雨滴动画只在 rain 模式、用户播放、页面可见、图片加载成功时运行。离开模式、暂停、页面隐藏或组件卸载时都会取消 `requestAnimationFrame`。粒子与帧时间都保存在 `useRef` 中，每帧不更新 React state，避免动画触发整个编辑器重渲染。

## 五、色彩涟漪：灰度底图 + 圆形裁剪揭色

“雨滴唤醒色彩”有两个阶段：雨滴从顶部落到用户点击的落点；随后涟漪向外扩散，圆内恢复彩色、圆外保持灰度。

图片加载时就创建两张离屏 Canvas：一张保存完整彩色原图，一张保存完整灰度原图。这样逐帧动画不必重复 `getImageData()`。

每帧先绘制灰度图，再使用 `clip()` 把彩色原图限制在涟漪圆内：

```ts
context.drawImage(grayscaleCanvas, 0, 0)

context.save()
context.beginPath()
context.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2)
context.clip()
context.drawImage(colorCanvas, 0, 0)
context.restore()
```

额外绘制几条透明度逐渐下降的圆环即可获得水面扩散提示。最大半径基于落点到四个角的最大距离计算，所以扩散范围为 100% 时能够覆盖整张图片。

## 六、导出：PNG 和 WebM 都来自当前 Canvas

PNG 导出使用：

```ts
canvas.toBlob(callback, 'image/png')
```

浏览器下载时创建临时 Object URL，触发 `<a>` 后在下一轮事件循环中撤销，避免过早释放影响部分浏览器的下载行为。保存到生成库同样先拿到当前 Canvas 的 PNG Blob，因此预览、下载和保存不会出现效果不一致。

色彩涟漪的动态导出使用浏览器原生能力：

```ts
const stream = canvas.captureStream(30)
const recorder = new MediaRecorder(stream, { mimeType })
```

格式按 VP9、VP8、通用 WebM 的顺序探测。录制复用普通预览动画，不复制第二套算法；无论成功、超时、报错还是组件卸载，都需要停止 RAF、MediaStream tracks 和超时定时器。

## 七、本地导入：Blob 持久化，Object URL 临时化

本地导入素材保存到 IndexedDB 的是原始 Blob 和元数据，不是 Base64，也不是 Object URL。编辑器路由只传稳定素材 ID：

```text
/editor/imported/:assetId
```

刷新后从 IndexedDB 重新读取 Blob，再创建新的 Object URL。异步读取完成时如果组件已经卸载，代码会立即撤销 URL；正常情况下则在图片切换或组件卸载时释放。这既能恢复本地素材，也避免浏览器长期持有无用 Blob。

## 结语

Canvas 特效真正困难的部分不是画一条雨线或一个圆，而是管理原图、帧循环、离屏画布、导出和临时资源。只要坚持四个原则——原图不变、每帧可重建、动画不驱动 React 重渲染、临时资源必须释放——不用第三方库也能实现可编辑、可导出、可保存的图片效果闭环。
