const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3888;

// 知识库路径
const KNOWLEDGE_DIR = path.resolve(__dirname, '..', 'docs');

// 静态资源
app.use(express.static(path.join(__dirname, 'public')));

// 扫描所有文章
function scanArticles() {
  const articles = [];
  
  function scanDir(dir, category) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanDir(fullPath, file); // 子目录作为分类
      } else if (file.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : file.replace('.md', '');
        
        // 获取相对于 docs 的路径
        const relativePath = path.relative(KNOWLEDGE_DIR, fullPath);
        
        // 确定分类（顶级目录）
        const parts = relativePath.split(path.sep);
        const topCategory = parts[0];
        
        articles.push({
          title,
          path: relativePath,
          category: topCategory,
          mtime: stat.mtime
        });
      }
    }
  }
  
  scanDir(KNOWLEDGE_DIR, '');
  return articles.sort((a, b) => a.path.localeCompare(b.path));
}

// API: 获取文章列表
app.get('/api/articles', (req, res) => {
  try {
    const articles = scanArticles();
    const lastUpdate = articles.reduce((latest, a) => 
      a.mtime > latest ? a.mtime : latest, new Date(0));
    
    res.json({ 
      success: true, 
      articles: articles.map(a => ({
        title: a.title,
        path: a.path,
        category: a.category
      })),
      lastUpdate
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: 获取单篇文章
app.get('/api/article', (req, res) => {
  try {
    const articlePath = req.query.path;
    if (!articlePath) {
      return res.status(400).json({ success: false, error: '缺少 path 参数' });
    }
    
    // 安全检查：防止路径遍历攻击
    const fullPath = path.resolve(KNOWLEDGE_DIR, articlePath);
    if (fullPath !== KNOWLEDGE_DIR && !fullPath.startsWith(KNOWLEDGE_DIR + path.sep)) {
      return res.status(403).json({ success: false, error: '非法路径' });
    }
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: '文章不存在' });
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({ 
      success: true, 
      content,
      path: articlePath
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 主页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`☕ Java 知识库网站运行中: http://localhost:${PORT}`);
  console.log(`📚 知识库目录: ${KNOWLEDGE_DIR}`);
});
