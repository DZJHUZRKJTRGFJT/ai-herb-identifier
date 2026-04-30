# 灵草鉴 - AI中药鉴定平台

基于前沿AI技术的中药材智能鉴定平台，纯前端实现，可直接部署到 GitHub Pages。

## 功能特性

- 浏览器内 AI 药材识别（无需后端服务器）
- 16种常见中药材知识库
- 像素级颜色特征分析
- 响应式设计，支持移动端
- 5页完整网站：首页、鉴定、百科、研究、关于

## 在线体验

访问 https://DZJHUZRKJTRGFJT.github.io/ai-herb-identifier/ 即可使用。

## 本地开发

```bash
npm install
server.js
```

然后访问 http://localhost:3001

## 技术栈

- 前端: HTML5, CSS3, Vanilla JavaScript
- 后端: Node.js (可选，提供增强识别)
- 识别引擎: Canvas API 像素分析 + 知识库匹配
