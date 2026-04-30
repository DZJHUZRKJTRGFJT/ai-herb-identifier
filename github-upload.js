#!/usr/bin/env node
/**
 * 通过 GitHub REST API 创建仓库并上传文件
 * 用法: node github-upload.js <token> [repo-name] [username]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = process.argv[2];
const REPO_NAME = process.argv[3] || 'ai-herb-identifier';
const USERNAME_ARG = process.argv[4];

if (!TOKEN) {
  console.error('用法: node github-upload.js <github-token> [repo-name] [username]');
  process.exit(1);
}

const PROJECT_DIR = __dirname;
const BRANCH = 'main';

// ========== GitHub API 封装 ==========
function githubAPI(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null;
    const options = {
      hostname: 'api.github.com',
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `token ${TOKEN}`,
        'User-Agent': 'ai-herb-uploader',
        'Accept': 'application/vnd.github.v3+json',
      }
    };
    if (postData) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const parsed = body ? JSON.parse(body) : {};
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data: parsed });
        } else {
          reject(new Error(`GitHub API error ${res.statusCode}: ${parsed.message || body}`));
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// ========== 收集文件 ==========
function collectFiles(dir, baseDir = '') {
  const results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relativePath = baseDir ? `${baseDir}/${item.name}` : item.name;
    if (item.isDirectory()) {
      if (['node_modules', '.git', 'temp'].includes(item.name)) continue;
      results.push(...collectFiles(fullPath, relativePath));
    } else {
      const ext = path.extname(item.name).toLowerCase();
      const allowedExts = ['.html', '.css', '.js', '.json', '.md'];
      if (allowedExts.includes(ext) || item.name === '.gitignore') {
        results.push({ fullPath, relativePath });
      }
    }
  }
  return results;
}

function collectImages(dir, baseDir = 'images') {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (!item.isFile()) continue;
    const ext = path.extname(item.name).toLowerCase();
    if (ext === '.png') {
      results.push({
        fullPath: path.join(dir, item.name),
        relativePath: `${baseDir}/${item.name}`
      });
    }
  }
  return results;
}

// ========== Base64 编码 ==========
function encodeFile(filePath) {
  const content = fs.readFileSync(filePath);
  return content.toString('base64');
}

// ========== 主逻辑 ==========
async function getAuthUser() {
  const res = await githubAPI('GET', '/user');
  return res.data.login;
}

async function createRepo(username) {
  try {
    await githubAPI('GET', `/repos/${username}/${REPO_NAME}`);
    console.log(`仓库 ${username}/${REPO_NAME} 已存在，跳过创建`);
    return;
  } catch (e) {}
  console.log(`创建仓库 ${username}/${REPO_NAME}...`);
  await githubAPI('POST', '/user/repos', {
    name: REPO_NAME,
    description: '灵草鉴 - AI中药鉴定平台 (纯前端版，可直接部署到GitHub Pages)',
    private: false,
    auto_init: false,
  });
  console.log('仓库创建成功！');
  await new Promise(r => setTimeout(r, 3000));
}

async function uploadFile(username, filePath, relativePath) {
  const content = encodeFile(filePath);
  try {
    const existing = await githubAPI('GET', `/repos/${username}/${REPO_NAME}/contents/${relativePath}?ref=${BRANCH}`);
    // 文件已存在，更新它
    await githubAPI('PUT', `/repos/${username}/${REPO_NAME}/contents/${relativePath}`, {
      message: `Update ${relativePath}`,
      content: content,
      sha: existing.data.sha,
      branch: BRANCH,
    });
  } catch (e) {
    // 文件不存在，创建它
    await githubAPI('PUT', `/repos/${username}/${REPO_NAME}/contents/${relativePath}`, {
      message: `Add ${relativePath}`,
      content: content,
      branch: BRANCH,
    });
  }
}

async function enablePages(username) {
  console.log('启用 GitHub Pages...');
  try {
    await githubAPI('POST', `/repos/${username}/${REPO_NAME}/pages`, {
      source: { branch: BRANCH, path: '/' }
    });
    console.log('GitHub Pages 已启用！');
  } catch (e) {
    try {
      await githubAPI('GET', `/repos/${username}/${REPO_NAME}/pages`);
      console.log('GitHub Pages 已经启用');
    } catch (e2) {
      console.log('启用 Pages 失败（可能需先提交至少1个文件）:', e2.message);
    }
  }
}

async function main() {
  try {
    const username = USERNAME_ARG || await getAuthUser();
    console.log(`已登录用户: ${username}`);
    console.log(`仓库名称: ${REPO_NAME}`);
    console.log('');

    // 1. 创建仓库
    await createRepo(username);

    // 2. 确保有 README.md
    const readmePath = path.join(PROJECT_DIR, 'README.md');
    if (!fs.existsSync(readmePath)) {
      const readmeContent = '# 灵草鉴 - AI中药鉴定平台\n\n' +
        '基于前沿AI技术的中药材智能鉴定平台，纯前端实现，可直接部署到 GitHub Pages。\n\n' +
        '## 功能特性\n\n' +
        '- 浏览器内 AI 药材识别（无需后端服务器）\n' +
        '- 16种常见中药材知识库\n' +
        '- 像素级颜色特征分析\n' +
        '- 响应式设计，支持移动端\n' +
        '- 5页完整网站：首页、鉴定、百科、研究、关于\n\n' +
        '## 在线体验\n\n' +
        `访问 https://${username}.github.io/${REPO_NAME}/ 即可使用。\n\n` +
        '## 本地开发\n\n' +
        '```bash\nnpm install\nserver.js\n```\n\n' +
        '然后访问 http://localhost:3001\n\n' +
        '## 技术栈\n\n' +
        '- 前端: HTML5, CSS3, Vanilla JavaScript\n' +
        '- 后端: Node.js (可选，提供增强识别)\n' +
        '- 识别引擎: Canvas API 像素分析 + 知识库匹配\n';
      fs.writeFileSync(readmePath, readmeContent);
    }

    // 3. 收集文件
    console.log('收集项目文件...');
    const files = collectFiles(PROJECT_DIR);
    const images = collectImages(path.join(PROJECT_DIR, 'images'));
    console.log(`发现 ${files.length} 个文件，${images.length} 张图片待上传`);
    console.log('');

    // 4. 上传文件
    console.log('开始上传文件...');
    let uploaded = 0;
    for (const file of files) {
      try {
        await uploadFile(username, file.fullPath, file.relativePath);
        uploaded++;
        console.log(`[${uploaded}/${files.length}] ${file.relativePath}`);
      } catch (e) {
        console.error(`  上传失败 ${file.relativePath}: ${e.message}`);
      }
    }

    // 5. 上传图片（GitHub API 每次请求限制 1MB，图片需分批）
    if (images.length > 0 && images.length <= 20) {
      console.log('');
      console.log('上传图片...');
      let imgUploaded = 0;
      for (const img of images) {
        try {
          // 检查文件大小（Base64 后增大约 1.37 倍）
          const stats = fs.statSync(img.fullPath);
          if (stats.size > 700 * 1024) {
            console.log(`  跳过 ${img.relativePath} (文件过大: ${(stats.size/1024).toFixed(0)}KB)`);
            continue;
          }
          await uploadFile(username, img.fullPath, img.relativePath);
          imgUploaded++;
          console.log(`  [${imgUploaded}/${images.length}] ${img.relativePath}`);
        } catch (e) {
          console.error(`  上传图片失败 ${img.relativePath}: ${e.message}`);
        }
      }
    } else if (images.length > 20) {
      console.log(`图片过多 (${images.length}张)，跳过图片上传。请在 GitHub 网页端手动上传，或用 git push。`);
    }

    console.log('');
    console.log('所有文件上传完成！');
    console.log('');

    // 6. 启用 GitHub Pages
    await enablePages(username);

    console.log('');
    console.log('========================================');
    console.log('  部署完成！');
    console.log('');
    console.log(`  仓库地址: https://github.com/${username}/${REPO_NAME}`);
    console.log(`  网站地址: https://${username}.github.io/${REPO_NAME}/`);
    console.log('');
    console.log('  注意: GitHub Pages 可能需要 1-5 分钟来构建和部署网站。');
    console.log('  请在 GitHub 仓库 Settings -> Pages 查看部署状态。');
    console.log('========================================');

  } catch (e) {
    console.error('错误:', e.message);
    process.exit(1);
  }
}

main();
