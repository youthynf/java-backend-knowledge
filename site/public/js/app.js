// 知识库分类配置
const CATEGORIES = [
  { id: '01-java-core', name: 'Java 核心', icon: '☕', desc: 'JVM、并发、集合、新特性', path: '01-java-core' },
  { id: '02-frameworks', name: '框架', icon: '🔧', desc: 'Spring、MyBatis、Spring Cloud', path: '02-frameworks' },
  { id: '03-database', name: '数据库', icon: '🗄️', desc: 'MySQL、Redis', path: '03-database' },
  { id: '04-mq', name: '消息队列', icon: '📨', desc: 'Kafka、RocketMQ、RabbitMQ', path: '04-mq' },
  { id: '05-distributed', name: '分布式', icon: '🌐', desc: '理论、锁、事务、ID', path: '05-distributed' },
  { id: '06-microservice', name: '微服务', icon: '📦', desc: '治理、网关、追踪', path: '06-microservice' },
  { id: '07-architecture', name: '架构设计', icon: '🏗️', desc: '模式、高并发、系统设计', path: '07-architecture' },
  { id: '08-network', name: '网络', icon: '🔗', desc: 'HTTP、TCP/IP', path: '08-network' },
  { id: '09-algorithm', name: '算法', icon: '📊', desc: '数据结构、算法思想', path: '09-algorithm' }
];

// 学习路线步骤
const LEARNING_STEPS = [
  'Java 基础', '并发编程', 'JVM 调优', 'Spring 全家桶', 
  '数据库', '分布式', '微服务', '系统设计'
];

// 全局状态
let articles = [];
let currentArticle = null;
let allArticles = [];

// DOM 元素
const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('mainContent');
const welcomeSection = document.getElementById('welcomeSection');
const articleView = document.getElementById('articleView');
const progressBar = document.getElementById('progressBar');
const backToTopBtn = document.getElementById('backToTop');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadAllArticles();
  renderSidebar();
  renderWelcome();
  setupEventListeners();
  handleHashChange();
});

// 加载所有文章
async function loadAllArticles() {
  const promises = CATEGORIES.map(async (cat) => {
    try {
      const res = await fetch(`/docs/${cat.path}/index.json`);
      if (!res.ok) return { category: cat, articles: [] };
      const list = await res.json();
      return { category: cat, articles: list || [] };
    } catch (e) {
      return { category: cat, articles: [] };
    }
  });
  
  const results = await Promise.all(promises);
  articles = results;
  
  // 扁平化所有文章用于搜索
  allArticles = results.flatMap(cat => 
    cat.articles.map(a => ({ ...a, categoryId: cat.category.id, categoryName: cat.category.name }))
  );
}

// 渲染侧边栏
function renderSidebar() {
  const content = document.querySelector('.sidebar-content');
  content.innerHTML = articles.map(cat => `
    <div class="category" data-category="${cat.category.id}">
      <div class="category-header">
        <span class="category-icon">${cat.category.icon}</span>
        <div class="category-info">
          <div class="category-name">${cat.category.name}</div>
          <div class="category-desc">${cat.category.desc}</div>
        </div>
        <span class="category-arrow">▶</span>
      </div>
      <div class="article-list">
        ${cat.articles.map(a => `
          <a class="article-item" href="#${cat.category.id}/${a.file}" data-article="${a.file}">
            ${a.title}
          </a>
        `).join('')}
      </div>
    </div>
  `).join('');
  
  // 绑定分类点击
  content.querySelectorAll('.category-header').forEach(header => {
    header.addEventListener('click', () => {
      const category = header.parentElement;
      const isExpanded = category.classList.contains('expanded');
      
      // 折叠所有分类
      document.querySelectorAll('.category').forEach(c => c.classList.remove('expanded'));
      
      // 如果之前未展开，则展开当前分类
      if (!isExpanded) {
        category.classList.add('expanded');
      }
    });
  });
  
  // 绑定文章点击
  content.querySelectorAll('.article-item').forEach(item => {
    item.addEventListener('click', (e) => {
      document.querySelectorAll('.article-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      // 移动端：收起侧边栏
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
      }
    });
  });
}

// 渲染欢迎页
function renderWelcome() {
  const stats = document.getElementById('stats');
  const categoryCards = document.getElementById('categoryCards');
  const pathTimeline = document.getElementById('pathTimeline');
  
  // 统计数据
  const totalArticles = allArticles.length;
  const totalCategories = CATEGORIES.length;
  stats.innerHTML = `
    <div class="stat-item"><div class="stat-number">${totalCategories}</div><div class="stat-label">知识模块</div></div>
    <div class="stat-item"><div class="stat-number">${totalArticles}</div><div class="stat-label">面试题</div></div>
    <div class="stat-item"><div class="stat-number">∞</div><div class="stat-label">学习热情</div></div>
  `;
  
  // 分类卡片
  categoryCards.innerHTML = articles.map(cat => `
    <div class="category-card" data-category="${cat.category.id}">
      <div class="card-header">
        <span class="card-icon">${cat.category.icon}</span>
        <span class="card-title">${cat.category.name}</span>
      </div>
      <div class="card-desc">${cat.category.desc}</div>
      <div class="card-footer">
        <span class="card-count"><strong>${cat.articles.length}</strong> 篇文章</span>
        <span class="card-arrow">→</span>
      </div>
    </div>
  `).join('');
  
  // 分类卡片点击
  categoryCards.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      const catId = card.dataset.category;
      const catEl = document.querySelector(`.category[data-category="${catId}"]`);
      if (catEl) {
        catEl.classList.add('expanded');
        catEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
  
  // 学习路线
  pathTimeline.innerHTML = LEARNING_STEPS.map((step, i) => `
    <div class="path-step" data-step="${i + 1}">
      <span class="path-num">${i + 1}</span>
      ${step}
    </div>
  `).join('');
  
  // 学习路线点击（根据序号跳转到对应分类）
  pathTimeline.querySelectorAll('.path-step').forEach(step => {
    step.addEventListener('click', () => {
      const stepNum = parseInt(step.dataset.step);
      const catId = CATEGORIES[Math.min(stepNum - 1, CATEGORIES.length - 1)].id;
      const catEl = document.querySelector(`.category[data-category="${catId}"]`);
      if (catEl) {
        catEl.classList.add('expanded');
        catEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// 设置事件监听
function setupEventListeners() {
  // Logo 点击
  document.querySelector('.logo').addEventListener('click', () => {
    window.location.hash = '';
    showWelcome();
  });
  
  // 搜索
  searchInput.addEventListener('input', debounce(handleSearch, 300));
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) handleSearch();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) searchResults.classList.remove('active');
  });
  
  // 滚动
  window.addEventListener('scroll', () => {
    // 进度条
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = (scrollTop / docHeight) * 100;
    progressBar.style.width = `${progress}%`;
    
    // 返回顶部按钮
    backToTopBtn.classList.toggle('visible', scrollTop > 300);
  });
  
  // 返回顶部
  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  
  // 路由变化
  window.addEventListener('hashchange', handleHashChange);
  
  // 移动端菜单
  document.querySelector('.menu-toggle').addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });
}

// 搜索处理
function handleSearch() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    searchResults.classList.remove('active');
    return;
  }
  
  const results = allArticles.filter(a => 
    a.title.toLowerCase().includes(query) || 
    (a.summary && a.summary.toLowerCase().includes(query))
  ).slice(0, 8);
  
  if (results.length === 0) {
    searchResults.innerHTML = '<div class="search-result-item"><div class="search-result-title">未找到相关文章</div></div>';
  } else {
    searchResults.innerHTML = results.map(a => `
      <div class="search-result-item" data-href="#${a.categoryId}/${a.file}">
        <div class="search-result-title">${a.title}</div>
        <div class="search-result-category">${a.categoryName}</div>
      </div>
    `).join('');
    
    searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        window.location.hash = item.dataset.href;
        searchResults.classList.remove('active');
        searchInput.value = '';
      });
    });
  }
  
  searchResults.classList.add('active');
}

// Hash 变化处理
function handleHashChange() {
  const hash = window.location.hash.slice(1);
  console.log('Hash changed:', hash);
  if (!hash) {
    showWelcome();
    return;
  }
  
  // hash 格式: categoryId/path/to/file.md
  // 需要正确分割：第一个 / 前面是 categoryId，后面是完整路径
  const firstSlash = hash.indexOf('/');
  const catId = hash.substring(0, firstSlash);
  const articleFile = hash.substring(firstSlash + 1);
  console.log('Parsed:', { catId, articleFile });
  if (catId && articleFile) {
    loadArticle(catId, articleFile);
  }
}

// 显示欢迎页
function showWelcome() {
  welcomeSection.style.display = 'block';
  articleView.classList.remove('active');
  document.querySelectorAll('.article-item').forEach(i => i.classList.remove('active'));
  document.title = 'Java 后端知识库';
}

// 加载文章
async function loadArticle(catId, articleFile) {
  const cat = articles.find(c => c.category.id === catId);
  if (!cat) return;
  
  const article = cat.articles.find(a => a.file === articleFile);
  if (!article) return;
  
  // 折叠所有分类，只展开当前分类
  document.querySelectorAll('.category').forEach(c => c.classList.remove('expanded'));
  const catEl = document.querySelector(`.category[data-category="${catId}"]`);
  if (catEl) catEl.classList.add('expanded');
  
  // 高亮当前文章
  document.querySelectorAll('.article-item').forEach(i => i.classList.remove('active'));
  const activeItem = document.querySelector(`.article-item[href="#${catId}/${articleFile}"]`);
  if (activeItem) activeItem.classList.add('active');
  
  // 移动端：收起侧边栏
  if (window.innerWidth <= 768) {
    sidebar.classList.remove('open');
  }
  
  // 显示加载状态
  welcomeSection.style.display = 'none';
  articleView.classList.add('active');
  articleView.innerHTML = '<div class="loading"><div class="loading-spinner"></div>加载中...</div>';
  
  try {
    // 构建正确的文件路径
    const filePath = `/docs/${cat.category.path}/${articleFile}`;
    console.log('Loading article from:', filePath); // 调试日志
    const res = await fetch(filePath);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const md = await res.text();
    
    currentArticle = { catId, article, content: md };
    
    // 渲染 Markdown
    articleView.innerHTML = `
      <div class="back-btn" onclick="showWelcome()">← 返回首页</div>
      <div class="article-content">${marked.parse(md)}</div>
      <div class="article-nav">
        <button id="prevBtn" onclick="navigateArticle(-1)">← 上一篇</button>
        <button id="nextBtn" onclick="navigateArticle(1)">下一篇 →</button>
      </div>
    `;
    
    // 处理图片自适应
    articleView.querySelectorAll('img').forEach(img => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';
    });
    
    // 处理代码块溢出
    articleView.querySelectorAll('pre').forEach(pre => {
      pre.style.overflowX = 'auto';
      pre.style.maxWidth = '100%';
    });
    
    document.title = `${article.title} - Java 后端知识库`;
    
    // 更新导航按钮状态
    updateNavButtons(catId, articleFile);
    
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    articleView.innerHTML = `
      <div class="back-btn" onclick="showWelcome()">← 返回首页</div>
      <div class="loading">加载失败，请稍后重试</div>
    `;
  }
}

// 更新导航按钮
function updateNavButtons(catId, articleFile) {
  const cat = articles.find(c => c.category.id === catId);
  if (!cat) return;
  
  const idx = cat.articles.findIndex(a => a.file === articleFile);
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= cat.articles.length - 1;
}

// 文章导航
function navigateArticle(direction) {
  if (!currentArticle) return;
  
  const cat = articles.find(c => c.category.id === currentArticle.catId);
  if (!cat) return;
  
  const idx = cat.articles.findIndex(a => a.file === currentArticle.article.file);
  const newIdx = idx + direction;
  
  if (newIdx >= 0 && newIdx < cat.articles.length) {
    window.location.hash = `${currentArticle.catId}/${cat.articles[newIdx].file}`;
  }
}

// 防抖函数
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ========== 移动端增强功能 ==========

// 创建遮罩层（如果不存在）
if (!document.getElementById('overlay')) {
  const overlayEl = document.createElement('div');
  overlayEl.id = 'overlay';
  overlayEl.className = 'overlay';
  overlayEl.onclick = function() {
    closeSidebar();
  };
  document.body.appendChild(overlayEl);
}

// 重写 toggleSidebar 增加遮罩层控制
const originalToggleSidebar = window.toggleSidebar;
window.toggleSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  if (sidebar) {
    sidebar.classList.toggle('open');
    if (overlay) {
      overlay.classList.toggle('active');
    }
    document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
  }
};

// 关闭侧边栏函数
window.closeSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  if (sidebar) {
    sidebar.classList.remove('open');
  }
  if (overlay) {
    overlay.classList.remove('active');
  }
  document.body.style.overflow = '';
};

// 创建移动端搜索按钮和弹窗
function createMobileSearchUI() {
  // 检查是否已存在
  if (document.getElementById('mobileSearchOverlay')) return;
  
  // 创建移动端搜索按钮
  const searchBtn = document.createElement('button');
  searchBtn.className = 'mobile-search-btn';
  searchBtn.id = 'mobileSearchBtn';
  searchBtn.innerHTML = '🔍';
  searchBtn.onclick = openMobileSearch;
  
  // 插入到导航栏
  const navRight = document.querySelector('.nav-right');
  if (navRight) {
    navRight.insertBefore(searchBtn, navRight.firstChild);
  }
  
  // 创建搜索弹窗
  const searchOverlay = document.createElement('div');
  searchOverlay.id = 'mobileSearchOverlay';
  searchOverlay.className = 'mobile-search-overlay';
  searchOverlay.innerHTML = `
    <div class="mobile-search-header">
      <input type="text" class="mobile-search-input" id="mobileSearchInput" placeholder="搜索文章...">
      <button class="mobile-search-close" onclick="closeMobileSearch()">取消</button>
    </div>
    <div class="mobile-search-results" id="mobileSearchResults"></div>
  `;
  document.body.appendChild(searchOverlay);
  
  // 绑定搜索事件
  const mobileInput = document.getElementById('mobileSearchInput');
  if (mobileInput) {
    mobileInput.addEventListener('input', handleMobileSearch);
  }
}

// 打开移动端搜索
window.openMobileSearch = function() {
  const overlay = document.getElementById('mobileSearchOverlay');
  const input = document.getElementById('mobileSearchInput');
  if (overlay) {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (input) input.focus();
  }
};

// 关闭移动端搜索
window.closeMobileSearch = function() {
  const overlay = document.getElementById('mobileSearchOverlay');
  const input = document.getElementById('mobileSearchInput');
  const results = document.getElementById('mobileSearchResults');
  if (overlay) {
    overlay.classList.remove('active');
  }
  if (input) {
    input.value = '';
  }
  if (results) {
    results.innerHTML = '';
  }
  document.body.style.overflow = '';
};

// 处理移动端搜索
function handleMobileSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  const resultsContainer = document.getElementById('mobileSearchResults');
  
  if (!resultsContainer) return;
  
  if (query.length < 1) {
    resultsContainer.innerHTML = '';
    return;
  }
  
  // 搜索文章
  const results = [];
  if (typeof articlesData !== 'undefined') {
    articlesData.forEach(article => {
      if (article.title.toLowerCase().includes(query)) {
        results.push(article);
      }
    });
  }
  
  // 渲染结果
  if (results.length === 0) {
    resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8;">未找到相关内容</div>';
    return;
  }
  
  const categoryMap = {};
  if (typeof articlesData !== 'undefined') {
    articlesData.forEach(a => { categoryMap[a.file] = a.category; });
  }
  
  resultsContainer.innerHTML = results.slice(0, 10).map(article => `
    <div class="search-result-item" onclick="loadArticle('${article.file}'); closeMobileSearch();">
      <div class="search-result-title">${article.title}</div>
      <div class="search-result-category">${categoryMap[article.file] || ''}</div>
    </div>
  `).join('');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  createMobileSearchUI();
});

console.log('移动端增强功能已加载');
