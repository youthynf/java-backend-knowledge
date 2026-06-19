#!/usr/bin/env node
/**
 * 同步知识库文章到网站
 * 1. 创建符号链接到知识库 docs 目录
 * 2. 为每个分类生成 index.json
 */

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_BASE = path.resolve(__dirname, '..', 'docs');
const SITE_DOCS = path.resolve(__dirname, '..', 'site', 'public', 'docs');

// 分类配置
const CATEGORIES = [
  '01-java-core', '02-frameworks', '03-database', '04-mq',
  '05-distributed', '06-microservice', '07-architecture', '08-network', '09-algorithm'
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getMarkdownFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      // 递归扫描子目录
      files.push(...getMarkdownFiles(fullPath));
    } else if (item.name.endsWith('.md')) {
      // 包含所有 md 文件，包括 README.md
      files.push(fullPath);
    }
  }
  return files;
}

function extractTitle(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : path.basename(filePath, '.md');
}

function generateIndex(categoryPath) {
  const files = getMarkdownFiles(categoryPath);
  const articles = files.map(file => {
    const relativePath = path.relative(categoryPath, file);
    const parts = relativePath.split('/');
    const filewebPath = parts.join('/');
    
    return {
      title: extractTitle(file),
      file: filewebPath,
      dir: parts.length > 1 ? parts[0] : ''
    };
  });
  
  return articles;
}

function main() {
  console.log('🔄 同步知识库文章...\n');
  
  // 确保目标目录存在
  ensureDir(SITE_DOCS);
  
  // 删除旧的符号链接或目录
  for (const cat of CATEGORIES) {
    const targetPath = path.join(SITE_DOCS, cat);
    if (fs.existsSync(targetPath)) {
      const stat = fs.lstatSync(targetPath);
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(targetPath);
        console.log(`  ❌ 删除旧链接: ${cat}`);
      } else {
        fs.rmSync(targetPath, { recursive: true });
        console.log(`  ❌ 删除旧目录: ${cat}`);
      }
    }
  }
  
  // 为每个分类创建符号链接
  let totalArticles = 0;
  for (const cat of CATEGORIES) {
    const sourcePath = path.join(KNOWLEDGE_BASE, cat);
    const targetPath = path.join(SITE_DOCS, cat);
    
    if (fs.existsSync(sourcePath)) {
      // 创建符号链接
      fs.symlinkSync(sourcePath, targetPath);
      console.log(`  ✅ 创建链接: ${cat}`);
      
      // 生成 index.json
      const articles = generateIndex(sourcePath);
      const indexPath = path.join(targetPath, 'index.json');
      fs.writeFileSync(indexPath, JSON.stringify(articles, null, 2));
      console.log(`     📝 生成索引: ${articles.length} 篇文章`);
      totalArticles += articles.length;
    } else {
      // 创建空目录和空索引
      ensureDir(targetPath);
      fs.writeFileSync(path.join(targetPath, 'index.json'), '[]');
      console.log(`  ⚠️  分类不存在: ${cat}`);
    }
  }
  
  console.log(`\n✅ 同步完成！共 ${totalArticles} 篇文章\n`);
}

main();
