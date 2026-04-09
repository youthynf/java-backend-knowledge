# 数据结构

## 核心概念

数据结构是算法的基础，选择合适的数据结构能显著提升程序效率。面试中常考的数据结构包括：数组、链表、栈、队列、哈希表、树、堆、图等。

### 数据结构分类

| 类型 | 特点 | 典型应用 |
|------|------|----------|
| 线性结构 | 元素一对一关系 | 数组、链表、栈、队列 |
| 树形结构 | 元素一对多关系 | 二叉树、堆、B+树 |
| 图结构 | 元素多对多关系 | 有向图、无向图 |
| 哈希结构 | 键值对映射 | HashMap、HashSet |

---

## 一、数组与链表

### 1. 数组 (Array)

**特点**：
- 连续内存空间存储相同类型元素
- 支持随机访问，时间复杂度 O(1)
- 插入/删除平均 O(n)（需要移动元素）

**面试高频问题**：

**Q1: 数组的优缺点？**
- 优点：随机访问快、内存连续（缓存友好）
- 缺点：大小固定、插入删除慢

**Q2: 为什么数组从 0 开始编号？**
```
地址计算：a[i] = base_address + i * size
如果从 1 开始：a[i] = base_address + (i-1) * size
```
从 0 开始可以减少一次减法运算。

**代码示例 - 动态数组实现**：
```java
public class DynamicArray<E> {
    private Object[] elementData;
    private int size;
    private static final int DEFAULT_CAPACITY = 10;
    
    public DynamicArray() {
        elementData = new Object[DEFAULT_CAPACITY];
    }
    
    // 扩容
    private void grow(int minCapacity) {
        int oldCapacity = elementData.length;
        int newCapacity = oldCapacity + (oldCapacity >> 1); // 1.5倍
        elementData = Arrays.copyOf(elementData, newCapacity);
    }
    
    public void add(E e) {
        if (size == elementData.length) {
            grow(size + 1);
        }
        elementData[size++] = e;
    }
    
    @SuppressWarnings("unchecked")
    public E get(int index) {
        if (index < 0 || index >= size) {
            throw new IndexOutOfBoundsException();
        }
        return (E) elementData[index];
    }
    
    public E remove(int index) {
        E oldValue = get(index);
        int numMoved = size - index - 1;
        if (numMoved > 0) {
            System.arraycopy(elementData, index + 1, elementData, index, numMoved);
        }
        elementData[--size] = null;
        return oldValue;
    }
}
```

### 2. 链表 (Linked List)

**特点**：
- 非连续内存，通过指针连接
- 插入/删除 O(1)（已知位置）
- 访问特定元素 O(n)

**面试高频问题**：

**Q1: 单链表反转**
```java
public ListNode reverseList(ListNode head) {
    ListNode prev = null;
    ListNode curr = head;
    while (curr != null) {
        ListNode next = curr.next;
        curr.next = prev;
        prev = curr;
        curr = next;
    }
    return prev;
}
```

**Q2: 检测链表是否有环**
```java
// 快慢指针法
public boolean hasCycle(ListNode head) {
    if (head == null || head.next == null) return false;
    
    ListNode slow = head;
    ListNode fast = head.next;
    
    while (slow != fast) {
        if (fast == null || fast.next == null) {
            return false;
        }
        slow = slow.next;
        fast = fast.next.next;
    }
    return true;
}
```

**Q3: 合并两个有序链表**
```java
public ListNode mergeTwoLists(ListNode l1, ListNode l2) {
    ListNode dummy = new ListNode(0);
    ListNode curr = dummy;
    
    while (l1 != null && l2 != null) {
        if (l1.val <= l2.val) {
            curr.next = l1;
            l1 = l1.next;
        } else {
            curr.next = l2;
            l2 = l2.next;
        }
        curr = curr.next;
    }
    
    curr.next = (l1 != null) ? l1 : l2;
    return dummy.next;
}
```

**Q4: 找到链表的中间节点**
```java
public ListNode middleNode(ListNode head) {
    ListNode slow = head;
    ListNode fast = head;
    
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
    }
    return slow;
}
```

---

## 二、栈与队列

### 1. 栈 (Stack)

**特点**：后进先出 (LIFO)

**面试高频问题**：

**Q1: 用数组实现栈**
```java
public class ArrayStack<E> {
    private Object[] data;
    private int top = -1;
    
    public ArrayStack(int capacity) {
        data = new Object[capacity];
    }
    
    public void push(E e) {
        if (top == data.length - 1) {
            throw new StackOverflowError();
        }
        data[++top] = e;
    }
    
    @SuppressWarnings("unchecked")
    public E pop() {
        if (isEmpty()) {
            throw new EmptyStackException();
        }
        E e = (E) data[top];
        data[top--] = null;
        return e;
    }
    
    public boolean isEmpty() {
        return top == -1;
    }
}
```

**Q2: 有效的括号**
```java
public boolean isValid(String s) {
    Deque<Character> stack = new ArrayDeque<>();
    Map<Character, Character> map = Map.of(')', '(', ']', '[', '}', '{');
    
    for (char c : s.toCharArray()) {
        if (map.containsKey(c)) {
            if (stack.isEmpty() || stack.pop() != map.get(c)) {
                return false;
            }
        } else {
            stack.push(c);
        }
    }
    return stack.isEmpty();
}
```

**Q3: 最小栈**
```java
public class MinStack {
    private Deque<Integer> stack;
    private Deque<Integer> minStack;
    
    public MinStack() {
        stack = new ArrayDeque<>();
        minStack = new ArrayDeque<>();
    }
    
    public void push(int val) {
        stack.push(val);
        if (minStack.isEmpty() || val <= minStack.peek()) {
            minStack.push(val);
        }
    }
    
    public void pop() {
        int val = stack.pop();
        if (val == minStack.peek()) {
            minStack.pop();
        }
    }
    
    public int getMin() {
        return minStack.peek();
    }
}
```

### 2. 队列 (Queue)

**特点**：先进先出 (FIFO)

**面试高频问题**：

**Q1: 用两个栈实现队列**
```java
public class MyQueue {
    private Deque<Integer> inStack;
    private Deque<Integer> outStack;
    
    public MyQueue() {
        inStack = new ArrayDeque<>();
        outStack = new ArrayDeque<>();
    }
    
    public void push(int x) {
        inStack.push(x);
    }
    
    public int pop() {
        if (outStack.isEmpty()) {
            while (!inStack.isEmpty()) {
                outStack.push(inStack.pop());
            }
        }
        return outStack.pop();
    }
    
    public int peek() {
        if (outStack.isEmpty()) {
            while (!inStack.isEmpty()) {
                outStack.push(inStack.pop());
            }
        }
        return outStack.peek();
    }
}
```

**Q2: 循环队列**
```java
public class CircularQueue {
    private int[] data;
    private int front;
    private int rear;
    private int size;
    
    public CircularQueue(int k) {
        data = new int[k];
        front = 0;
        rear = -1;
        size = 0;
    }
    
    public boolean enQueue(int value) {
        if (isFull()) return false;
        rear = (rear + 1) % data.length;
        data[rear] = value;
        size++;
        return true;
    }
    
    public boolean deQueue() {
        if (isEmpty()) return false;
        front = (front + 1) % data.length;
        size--;
        return true;
    }
    
    public int Front() {
        return isEmpty() ? -1 : data[front];
    }
    
    public int Rear() {
        return isEmpty() ? -1 : data[rear];
    }
    
    public boolean isEmpty() {
        return size == 0;
    }
    
    public boolean isFull() {
        return size == data.length;
    }
}
```

---

## 三、哈希表

### 核心原理

**哈希冲突解决**：

| 方法 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| 链地址法 | 冲突元素用链表连接 | 简单，删除方便 | 链表过长影响性能 |
| 开放寻址 | 寻找下一个空槽位 | 缓存友好 | 容易聚集 |
| 再哈希 | 使用另一个哈希函数 | 减少聚集 | 计算开销大 |

**面试高频问题**：

**Q1: 两数之和**
```java
public int[] twoSum(int[] nums, int target) {
    Map<Integer, Integer> map = new HashMap<>();
    for (int i = 0; i < nums.length; i++) {
        int complement = target - nums[i];
        if (map.containsKey(complement)) {
            return new int[]{map.get(complement), i};
        }
        map.put(nums[i], i);
    }
    return new int[]{};
}
```

**Q2: 字母异位词分组**
```java
public List<List<String>> groupAnagrams(String[] strs) {
    Map<String, List<String>> map = new HashMap<>();
    
    for (String s : strs) {
        char[] chars = s.toCharArray();
        Arrays.sort(chars);
        String key = new String(chars);
        
        map.computeIfAbsent(key, k -> new ArrayList<>()).add(s);
    }
    
    return new ArrayList<>(map.values());
}
```

**Q3: LRU 缓存**
```java
public class LRUCache {
    private int capacity;
    private Map<Integer, Node> map;
    private Node head;
    private Node tail;
    
    class Node {
        int key, value;
        Node prev, next;
        Node(int k, int v) { key = k; value = v; }
    }
    
    public LRUCache(int capacity) {
        this.capacity = capacity;
        map = new HashMap<>();
        head = new Node(0, 0);
        tail = new Node(0, 0);
        head.next = tail;
        tail.prev = head;
    }
    
    public int get(int key) {
        if (!map.containsKey(key)) return -1;
        Node node = map.get(key);
        remove(node);
        addToHead(node);
        return node.value;
    }
    
    public void put(int key, int value) {
        if (map.containsKey(key)) {
            Node node = map.get(key);
            node.value = value;
            remove(node);
            addToHead(node);
        } else {
            Node node = new Node(key, value);
            map.put(key, node);
            addToHead(node);
            if (map.size() > capacity) {
                Node lru = tail.prev;
                remove(lru);
                map.remove(lru.key);
            }
        }
    }
    
    private void remove(Node node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
    }
    
    private void addToHead(Node node) {
        node.next = head.next;
        node.prev = head;
        head.next.prev = node;
        head.next = node;
    }
}
```

---

## 四、树

### 1. 二叉树

**遍历方式**：

| 遍历 | 顺序 | 应用场景 |
|------|------|----------|
| 前序 | 根-左-右 | 复制树、表达式前缀 |
| 中序 | 左-根-右 | BST 有序遍历 |
| 后序 | 左-右-根 | 删除树、表达式后缀 |
| 层序 | 逐层遍历 | 层次相关操作 |

**代码示例 - 遍历实现**：
```java
// 前序遍历（递归）
public void preOrder(TreeNode root, List<Integer> result) {
    if (root == null) return;
    result.add(root.val);
    preOrder(root.left, result);
    preOrder(root.right, result);
}

// 前序遍历（迭代）
public List<Integer> preOrderIterative(TreeNode root) {
    List<Integer> result = new ArrayList<>();
    if (root == null) return result;
    
    Deque<TreeNode> stack = new ArrayDeque<>();
    stack.push(root);
    
    while (!stack.isEmpty()) {
        TreeNode node = stack.pop();
        result.add(node.val);
        if (node.right != null) stack.push(node.right);
        if (node.left != null) stack.push(node.left);
    }
    return result;
}

// 层序遍历
public List<List<Integer>> levelOrder(TreeNode root) {
    List<List<Integer>> result = new ArrayList<>();
    if (root == null) return result;
    
    Queue<TreeNode> queue = new LinkedList<>();
    queue.offer(root);
    
    while (!queue.isEmpty()) {
        int levelSize = queue.size();
        List<Integer> level = new ArrayList<>();
        
        for (int i = 0; i < levelSize; i++) {
            TreeNode node = queue.poll();
            level.add(node.val);
            if (node.left != null) queue.offer(node.left);
            if (node.right != null) queue.offer(node.right);
        }
        result.add(level);
    }
    return result;
}
```

**面试高频问题**：

**Q1: 二叉树的最大深度**
```java
public int maxDepth(TreeNode root) {
    if (root == null) return 0;
    return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
}
```

**Q2: 判断是否是平衡二叉树**
```java
public boolean isBalanced(TreeNode root) {
    return height(root) != -1;
}

private int height(TreeNode node) {
    if (node == null) return 0;
    
    int leftHeight = height(node.left);
    if (leftHeight == -1) return -1;
    
    int rightHeight = height(node.right);
    if (rightHeight == -1) return -1;
    
    if (Math.abs(leftHeight - rightHeight) > 1) return -1;
    
    return 1 + Math.max(leftHeight, rightHeight);
}
```

**Q3: 二叉树的最近公共祖先**
```java
public TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {
    if (root == null || root == p || root == q) {
        return root;
    }
    
    TreeNode left = lowestCommonAncestor(root.left, p, q);
    TreeNode right = lowestCommonAncestor(root.right, p, q);
    
    if (left != null && right != null) {
        return root;  // p 和 q 分别在左右子树
    }
    return left != null ? left : right;
}
```

### 2. 二叉搜索树 (BST)

**特点**：
- 左子树所有节点值 < 根节点值
- 右子树所有节点值 > 根节点值
- 中序遍历得到有序序列

**面试高频问题**：

**Q1: 验证 BST**
```java
public boolean isValidBST(TreeNode root) {
    return validate(root, null, null);
}

private boolean validate(TreeNode node, Integer min, Integer max) {
    if (node == null) return true;
    
    if (min != null && node.val <= min) return false;
    if (max != null && node.val >= max) return false;
    
    return validate(node.left, min, node.val) && 
           validate(node.right, node.val, max);
}
```

**Q2: BST 中第 K 小的元素**
```java
private int count = 0;
private int result = 0;

public int kthSmallest(TreeNode root, int k) {
    inorder(root, k);
    return result;
}

private void inorder(TreeNode node, int k) {
    if (node == null) return;
    
    inorder(node.left, k);
    count++;
    if (count == k) {
        result = node.val;
        return;
    }
    inorder(node.right, k);
}
```

### 3. 堆 (Heap)

**特点**：
- 完全二叉树
- 大顶堆：父节点 >= 子节点
- 小顶堆：父节点 <= 子节点

**面试高频问题**：

**Q1: 数组中的第 K 个最大元素**
```java
public int findKthLargest(int[] nums, int k) {
    // 小顶堆，保持 k 个最大的元素
    PriorityQueue<Integer> heap = new PriorityQueue<>();
    
    for (int num : nums) {
        heap.offer(num);
        if (heap.size() > k) {
            heap.poll(); // 移除最小的
        }
    }
    return heap.peek();
}
```

**Q2: 合并 K 个有序链表**
```java
public ListNode mergeKLists(ListNode[] lists) {
    if (lists == null || lists.length == 0) return null;
    
    PriorityQueue<ListNode> heap = new PriorityQueue<>((a, b) -> a.val - b.val);
    
    for (ListNode node : lists) {
        if (node != null) {
            heap.offer(node);
        }
    }
    
    ListNode dummy = new ListNode(0);
    ListNode curr = dummy;
    
    while (!heap.isEmpty()) {
        ListNode node = heap.poll();
        curr.next = node;
        curr = curr.next;
        
        if (node.next != null) {
            heap.offer(node.next);
        }
    }
    return dummy.next;
}
```

---

## 五、图

### 基本概念

| 术语 | 定义 |
|------|------|
| 顶点 (Vertex) | 图中的节点 |
| 边 (Edge) | 连接两个顶点的线 |
| 有向图 | 边有方向 |
| 无向图 | 边无方向 |
| 度 (Degree) | 与顶点相连的边数 |
| 权 (Weight) | 边的权值 |

### 遍历算法

**DFS（深度优先搜索）**：
```java
public void dfs(Graph graph, int start, boolean[] visited) {
    visited[start] = true;
    System.out.println("访问节点: " + start);
    
    for (int neighbor : graph.getNeighbors(start)) {
        if (!visited[neighbor]) {
            dfs(graph, neighbor, visited);
        }
    }
}

// 迭代版本
public void dfsIterative(Graph graph, int start) {
    boolean[] visited = new boolean[graph.size()];
    Deque<Integer> stack = new ArrayDeque<>();
    stack.push(start);
    
    while (!stack.isEmpty()) {
        int node = stack.pop();
        if (!visited[node]) {
            visited[node] = true;
            System.out.println("访问节点: " + node);
            for (int neighbor : graph.getNeighbors(node)) {
                if (!visited[neighbor]) {
                    stack.push(neighbor);
                }
            }
        }
    }
}
```

**BFS（广度优先搜索）**：
```java
public void bfs(Graph graph, int start) {
    boolean[] visited = new boolean[graph.size()];
    Queue<Integer> queue = new LinkedList<>();
    
    visited[start] = true;
    queue.offer(start);
    
    while (!queue.isEmpty()) {
        int node = queue.poll();
        System.out.println("访问节点: " + node);
        
        for (int neighbor : graph.getNeighbors(node)) {
            if (!visited[neighbor]) {
                visited[neighbor] = true;
                queue.offer(neighbor);
            }
        }
    }
}
```

### 面试高频问题

**Q1: 岛屿数量**
```java
public int numIslands(char[][] grid) {
    if (grid == null || grid.length == 0) return 0;
    
    int count = 0;
    for (int i = 0; i < grid.length; i++) {
        for (int j = 0; j < grid[0].length; j++) {
            if (grid[i][j] == '1') {
                count++;
                dfs(grid, i, j);
            }
        }
    }
    return count;
}

private void dfs(char[][] grid, int i, int j) {
    if (i < 0 || i >= grid.length || j < 0 || j >= grid[0].length || grid[i][j] == '0') {
        return;
    }
    grid[i][j] = '0';  // 标记为已访问
    dfs(grid, i + 1, j);
    dfs(grid, i - 1, j);
    dfs(grid, i, j + 1);
    dfs(grid, i, j - 1);
}
```

**Q2: 课程表（拓扑排序）**
```java
public boolean canFinish(int numCourses, int[][] prerequisites) {
    // 构建邻接表和入度数组
    List<List<Integer>> graph = new ArrayList<>();
    int[] inDegree = new int[numCourses];
    
    for (int i = 0; i < numCourses; i++) {
        graph.add(new ArrayList<>());
    }
    
    for (int[] pre : prerequisites) {
        graph.get(pre[1]).add(pre[0]);
        inDegree[pre[0]]++;
    }
    
    // BFS 拓扑排序
    Queue<Integer> queue = new LinkedList<>();
    for (int i = 0; i < numCourses; i++) {
        if (inDegree[i] == 0) {
            queue.offer(i);
        }
    }
    
    int count = 0;
    while (!queue.isEmpty()) {
        int course = queue.poll();
        count++;
        for (int next : graph.get(course)) {
            if (--inDegree[next] == 0) {
                queue.offer(next);
            }
        }
    }
    
    return count == numCourses;
}
```

**Q3: 最短路径（Dijkstra）**
```java
public int[] dijkstra(int[][] graph, int start) {
    int n = graph.length;
    int[] dist = new int[n];
    boolean[] visited = new boolean[n];
    
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[start] = 0;
    
    for (int i = 0; i < n; i++) {
        // 找到未访问的最短距离节点
        int u = -1;
        for (int j = 0; j < n; j++) {
            if (!visited[j] && (u == -1 || dist[j] < dist[u])) {
                u = j;
            }
        }
        
        visited[u] = true;
        
        // 更新邻居距离
        for (int v = 0; v < n; v++) {
            if (graph[u][v] > 0 && !visited[v]) {
                dist[v] = Math.min(dist[v], dist[u] + graph[u][v]);
            }
        }
    }
    return dist;
}
```

---

## 时间复杂度速查表

| 数据结构 | 访问 | 查找 | 插入 | 删除 |
|----------|------|------|------|------|
| 数组 | O(1) | O(n) | O(n) | O(n) |
| 链表 | O(n) | O(n) | O(1)* | O(1)* |
| 栈 | O(n) | O(n) | O(1) | O(1) |
| 队列 | O(n) | O(n) | O(1) | O(1) |
| 哈希表 | - | O(1)** | O(1)** | O(1)** |
| BST | O(log n)*** | O(log n)*** | O(log n)*** | O(log n)*** |
| 堆 | O(1)（堆顶） | O(n) | O(log n) | O(log n) |

\* 已知位置  
\*\* 平均情况，最坏 O(n)  
\*\*\* 平衡情况下

---

## 实战场景

### 场景1：设计推特时间线
- 使用 **堆** 维护关注用户的最新推文
- 时间复杂度：O(n log k)，n 是关注数，k 是获取数量

### 场景2：实现浏览器前进后退
- 使用 **两个栈**，一个前进栈一个后退栈

### 场景3：任务调度系统
- 使用 **优先队列（堆）** 按优先级执行任务

### 场景4：LRU 缓存淘汰
- **哈希表 + 双向链表**，O(1) 读写

### 场景5：社交网络好友推荐
- **BFS** 找二度好友（朋友的朋友）

---

## 延伸思考

1. **HashMap 为什么线程不安全？** 如何实现线程安全？
   - ConcurrentHashMap 如何保证线程安全？
   
2. **红黑树** 相比 AVL 树的优势？
   - 为什么 Java 8 HashMap 用红黑树而不是 AVL 树？

3. **跳表** 是什么？为什么 Redis 用跳表实现 ZSET？

4. **B+ 树** 为什么适合数据库索引？
   - 与 B 树的区别是什么？

5. **布隆过滤器** 原理和应用场景？

---

## 参考资料

- [LeetCode 热题 100](https://leetcode.cn/studyplan/top-100-liked/)
- [算法导论 (CLRS)](https://mitpress.mit.edu/books/introduction-algorithms-fourth-edition)
- [Java 集合框架源码](https://github.com/openjdk/jdk/tree/master/src/java.base/share/classes/java/util)

---

*最后更新: 2026-04-09*