#!/usr/bin/env node
/**
 * 批量抓取阿里云开发者TOP20文章并整理进知识库
 * 用法: node fetch-aliyun-articles.js [--start N] [--dry-run]
 */
const { chromium } = require('/home/youth/.openclaw/workspace/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KB_ROOT = '/opt/services/java-backend-knowledge';

const articles = [
  {
    id: 4,
    title: 'LeetCode真题上了生产',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247543905&idx=1&sn=abc78b94cbbb3c3eb16ae7cd908e3333&scene=21#wechat_redirect',
    dir: 'docs/01-java-core/jvm',
    filename: 'leetcode-in-production.md'
  },
  {
    id: 5,
    title: '埋藏9年的底层bug',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247538282&idx=1&sn=96f2a45a4bdfeabafb38543cfb1b068a&scene=21#wechat_redirect',
    dir: 'docs/01-java-core',
    filename: '9-year-buried-bug.md'
  },
  {
    id: 6,
    title: '画好架构图业务图流程图',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247536480&idx=1&sn=a6d5f9b474d7f55f49b7d0d2c1df3569&scene=21#wechat_redirect',
    dir: 'docs/07-architecture',
    filename: 'architecture-diagram-guide.md'
  },
  {
    id: 7,
    title: '八股文引起的内存泄漏',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247537232&idx=1&sn=9e19a2d43250602e353b609dfc4043ab&scene=21#wechat_redirect',
    dir: 'docs/01-java-core/jvm',
    filename: 'baguwen-memory-leak.md'
  },
  {
    id: 8,
    title: '火焰图分析CPU下降20%',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247541710&idx=1&sn=4cf20a294c6cea64b98a97e980e4fa0d&scene=21#wechat_redirect',
    dir: 'docs/07-architecture/high-concurrency',
    filename: 'flame-graph-cpu-optimization.md'
  },
  {
    id: 9,
    title: '删掉99%的useMemo',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247536687&idx=1&sn=3db27e0d84abdff8a5d325adef15445b&scene=21#wechat_redirect',
    dir: 'docs/frontend/react',
    filename: 'remove-99-percent-usememo.md'
  },
  {
    id: 10,
    title: 'for循环也会出问题',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247539579&idx=1&sn=d03be852ea54538732eb14ff23efcae7&scene=21#wechat_redirect',
    dir: 'docs/01-java-core/collections',
    filename: 'for-loop-pitfalls.md'
  },
  {
    id: 11,
    title: '两种常用代码范式',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247543597&idx=1&sn=d04e084268616aae070bcbceb6c808f4&scene=21#wechat_redirect',
    dir: 'docs/07-architecture/patterns',
    filename: 'two-common-code-paradigms.md'
  },
  {
    id: 12,
    title: 'Kafka面试题',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247537240&idx=1&sn=7e1edc2bec75a1e06ae58bc8b50cfa4f&scene=21#wechat_redirect',
    dir: 'docs/04-mq/kafka',
    filename: 'kafka-interview-aliyun.md'
  },
  {
    id: 13,
    title: '性能优化思路及工具',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247536495&idx=1&sn=4561c6736efd2b3a22cfce7e779aa0de&scene=21#wechat_redirect',
    dir: 'docs/07-architecture/high-concurrency',
    filename: 'performance-optimization-tools.md'
  },
  {
    id: 14,
    title: '速通高级系统架构设计师',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247536825&idx=1&sn=a28f7f17f8be69c1aa8f21f238f570a6&scene=21#wechat_redirect',
    dir: 'docs/reading/articles',
    filename: 'system-architect-exam-guide.md'
  },
  {
    id: 15,
    title: 'Java字符串拼接技术演进',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247540622&idx=1&sn=06610c8ac15bd6748bf21ad1a022efae&scene=21#wechat_redirect',
    dir: 'docs/01-java-core',
    filename: 'string-concatenation-evolution.md'
  },
  {
    id: 16,
    title: '异步日志性能优化金钥匙',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247539416&idx=1&sn=30a7a767aa24429a7b3640291265d69b&scene=21#wechat_redirect',
    dir: 'docs/02-frameworks',
    filename: 'async-logging-performance.md'
  },
  {
    id: 17,
    title: '软件架构一致性',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247537236&idx=1&sn=e52ee0c7db35f688ea7b43331ed55000&scene=21#wechat_redirect',
    dir: 'docs/07-architecture',
    filename: 'software-architecture-consistency.md'
  },
  {
    id: 18,
    title: '写好代码提升可读性技巧',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247536700&idx=1&sn=b99aafa51c599d8f949657a2dbbcb7a0&scene=21#wechat_redirect',
    dir: 'docs/07-architecture/patterns',
    filename: 'code-readability-tips.md'
  },
  {
    id: 19,
    title: 'Sora关键信息',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247537288&idx=1&sn=a8dc457bf09322866dad49b0c75f01ca&scene=21#wechat_redirect',
    dir: 'docs/ai/llm',
    filename: 'sora-key-info.md'
  },
  {
    id: 20,
    title: '软考高项攻略',
    url: 'https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247543372&idx=1&sn=d10c072d5a3b2e2d4fab0abddb6b9ff7&scene=21#wechat_redirect',
    dir: 'docs/reading/articles',
    filename: 'soft-exam-senior-guide.md'
  }
];

// Parse args
const args = process.argv.slice(2);
const startIndex = parseInt(args.find(a => a.startsWith('--start='))?.split('=')[1] || '0');
const dryRun = args.includes('--dry-run');

async function fetchArticle(page, url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('#js_content', { timeout: 15000 });
      await page.waitForTimeout(2000);
      
      const data = await page.evaluate(() => {
        const title = document.querySelector('#activity-name')?.textContent?.trim() || 
                      document.querySelector('.rich_media_title')?.textContent?.trim() || '';
        const content = document.querySelector('#js_content')?.innerText || '';
        // Also get HTML for code blocks
        const html = document.querySelector('#js_content')?.innerHTML || '';
        return { title, content, html };
      });
      
      if (data.content && data.content.length > 200) {
        return data;
      }
      throw new Error('Content too short, might be blocked');
    } catch(e) {
      console.error(`  Attempt ${attempt+1} failed: ${e.message}`);
      if (attempt < retries) {
        console.log('  Retrying in 5s...');
        await page.waitForTimeout(5000);
      }
    }
  }
  return null;
}

function contentToMarkdown(title, content, url, html) {
  // Convert the raw text content into a structured knowledge base article
  const lines = content.split('\n').filter(l => l.trim());
  
  // Try to extract code blocks from HTML
  let codeBlocks = [];
  try {
    const codeRegex = /<code[^>]*>([\s\S]*?)<\/code>/g;
    const preRegex = /<pre[^>]*>([\s\S]*?)<\/pre>/g;
    let match;
    while ((match = preRegex.exec(html)) !== null) {
      // Extract text from pre blocks (which often contain code)
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text.length > 10) {
        codeBlocks.push(text);
      }
    }
  } catch(e) {}
  
  // Build the markdown
  let md = `# ${title}\n\n`;
  md += `> 来源：[阿里云开发者 - ${title}](${url})\n\n`;
  
  md += `## 核心概念\n\n`;
  // Extract key points from content
  let inConcept = true;
  let concepts = [];
  let interviewQ = [];
  let scenarios = [];
  let codeSnippets = [];
  let extendedThinking = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    
    // Skip title-like lines that repeat the article title
    if (trimmed === title || trimmed.length < 5) continue;
    
    // Categorize content heuristically
    if (trimmed.includes('面试') || trimmed.includes('常见问题') || trimmed.includes('问：') || trimmed.includes('Q:')) {
      interviewQ.push(trimmed);
    } else if (trimmed.includes('场景') || trimmed.includes('实战') || trimmed.includes('案例') || trimmed.includes('生产')) {
      scenarios.push(trimmed);
    } else if (trimmed.match(/^(public|private|class|void|int|String|import|@|if\s|for\s|while\s|try|catch|return)/)) {
      codeSnippets.push(trimmed);
    } else {
      concepts.push(trimmed);
    }
  }
  
  // Write concepts (first 1/3 of content roughly)
  const conceptLines = concepts.slice(0, Math.ceil(concepts.length * 0.6));
  for (const c of conceptLines) {
    if (c.startsWith('•') || c.startsWith('-') || c.startsWith('·') || c.match(/^\d+[.、]/)) {
      md += `- ${c.replace(/^[•\-·\d.、\s]+/, '')}\n`;
    } else {
      md += `${c}\n\n`;
    }
  }
  
  // Interview questions
  md += `\n## 面试高频问题\n\n`;
  if (interviewQ.length > 0) {
    interviewQ.forEach((q, i) => {
      md += `${i+1}. ${q}\n\n`;
    });
  } else {
    md += `1. ${title}的核心原理是什么？\n   - 见上文核心概念\n\n`;
    md += `2. 在实际项目中如何应用？\n   - 见下方实战场景\n\n`;
  }
  
  // Practical scenarios
  md += `## 实战场景\n\n`;
  if (scenarios.length > 0) {
    scenarios.forEach(s => {
      md += `- ${s}\n\n`;
    });
  } else {
    md += `- 基于阿里云生产环境的实践经验总结\n\n`;
  }
  
  // Code examples
  md += `## 代码示例\n\n`;
  if (codeBlocks.length > 0) {
    codeBlocks.slice(0, 5).forEach(block => {
      md += `\`\`\`java\n${block}\n\`\`\`\n\n`;
    });
  } else if (codeSnippets.length > 0) {
    md += `\`\`\`java\n${codeSnippets.join('\n')}\n\`\`\`\n\n`;
  } else {
    md += `> 详见原文代码示例\n\n`;
  }
  
  // Extended thinking
  md += `## 延伸思考\n\n`;
  md += `- ${title}在不同业务场景下的权衡取舍\n`;
  md += `- 与其他技术方案的对比分析\n`;
  md += `- 大规模分布式系统中的注意事项\n\n`;
  
  // References
  md += `## 参考资料\n\n`;
  md += `- [${title}](${url})\n`;
  md += `- 阿里云开发者公众号\n`;
  
  return md;
}

async function main() {
  console.log(`\n🚀 Starting to fetch ${articles.length} articles (from index ${startIndex})\n`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  let success = 0;
  let failed = [];
  
  for (let i = startIndex; i < articles.length; i++) {
    const article = articles[i];
    console.log(`\n[${i+1}/${articles.length}] Fetching: ${article.title}`);
    console.log(`  URL: ${article.url}`);
    
    try {
      const data = await fetchArticle(page, article.url);
      
      if (!data) {
        console.log(`  ❌ Failed to fetch content`);
        failed.push(article);
        continue;
      }
      
      console.log(`  ✅ Got ${data.content.length} chars, title: "${data.title}"`);
      
      if (dryRun) {
        console.log(`  (dry-run) Would save to ${article.dir}/${article.filename}`);
        continue;
      }
      
      // Ensure directory exists
      const dirPath = path.join(KB_ROOT, article.dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`  📁 Created directory: ${dirPath}`);
      }
      
      // Convert to markdown
      const md = contentToMarkdown(data.title || article.title, data.content, article.url, data.html);
      
      // Save file
      const filePath = path.join(dirPath, article.filename);
      fs.writeFileSync(filePath, md, 'utf-8');
      console.log(`  💾 Saved: ${filePath}`);
      
      // Git commit
      try {
        execSync(`cd ${KB_ROOT} && git add "${article.dir}/${article.filename}" && git commit -m "feat: 添加 ${article.title}"`, { stdio: 'pipe' });
        console.log(`  ✅ Git committed`);
      } catch(e) {
        console.log(`  ⚠️ Git commit issue: ${e.message.slice(0, 100)}`);
      }
      
      success++;
      
      // Small delay between requests
      await page.waitForTimeout(2000);
      
    } catch(e) {
      console.error(`  ❌ Error: ${e.message}`);
      failed.push(article);
    }
  }
  
  await browser.close();
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 Results: ${success} succeeded, ${failed.length} failed`);
  
  if (failed.length > 0) {
    console.log(`\n❌ Failed articles:`);
    failed.forEach(a => console.log(`  - [${a.id}] ${a.title}`));
  }
  
  if (!dryRun && success > 0) {
    console.log(`\n🔄 Pushing to remote...`);
    try {
      execSync(`cd ${KB_ROOT} && git push`, { stdio: 'inherit' });
      console.log('  ✅ Pushed!');
    } catch(e) {
      console.log(`  ⚠️ Push failed: ${e.message.slice(0, 100)}`);
    }
  }
  
  console.log('\n✅ Done!');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
