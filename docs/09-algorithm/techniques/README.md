# 算法思想

## 核心概念

算法思想是解决复杂问题的通用方法论。掌握这些思想，可以从根本上提升解题能力。常见算法思想包括：动态规划、贪心、回溯、分治、滑动窗口、双指针等。

---

## 一、动态规划 (Dynamic Programming)

### 核心思想

将复杂问题分解为重叠子问题，通过存储子问题的解避免重复计算。

**关键要素**：
1. **最优子结构**：问题的最优解包含子问题的最优解
2. **重叠子问题**：子问题会被重复计算
3. **状态转移方程**：描述状态之间的关系

**解题步骤**：
1. 定义状态（dp 数组的含义）
2. 找出状态转移方程
3. 确定初始条件和边界
4. 确定计算顺序

### 经典问题

**Q1: 爬楼梯**
```java
public int climbStairs(int n) {
    if (n <= 2) return n;
    
    // dp[i] = 爬到第 i 阶的方法数
    int[] dp = new int[n + 1];
    dp[1] = 1;
    dp[2] = 2;
    
    for (int i = 3; i <= n; i++) {
        dp[i] = dp[i - 1] + dp[i - 2];
    }
    return dp[n];
}

// 空间优化版本
public int climbStairsOptimized(int n) {
    if (n <= 2) return n;
    int prev2 = 1, prev1 = 2;
    for (int i = 3; i <= n; i++) {
        int curr = prev1 + prev2;
        prev2 = prev1;
        prev1 = curr;
    }
    return prev1;
}
```

**Q2: 最长递增子序列 (LIS)**
```java
// O(n²) 解法
public int lengthOfLIS(int[] nums) {
    int n = nums.length;
    int[] dp = new int[n];
    Arrays.fill(dp, 1);
    int maxLen = 1;
    
    for (int i = 1; i < n; i++) {
        for (int j = 0; j < i; j++) {
            if (nums[i] > nums[j]) {
                dp[i] = Math.max(dp[i], dp[j] + 1);
            }
        }
        maxLen = Math.max(maxLen, dp[i]);
    }
    return maxLen;
}

// O(n log n) 解法：贪心 + 二分
public int lengthOfLISOptimized(int[] nums) {
    List<Integer> tails = new ArrayList<>();
    
    for (int num : nums) {
        if (tails.isEmpty() || num > tails.get(tails.size() - 1)) {
            tails.add(num);
        } else {
            // 二分查找第一个 >= num 的位置
            int left = 0, right = tails.size() - 1;
            while (left < right) {
                int mid = left + (right - left) / 2;
                if (tails.get(mid) < num) {
                    left = mid + 1;
                } else {
                    right = mid;
                }
            }
            tails.set(left, num);
        }
    }
    return tails.size();
}
```

**Q3: 0-1 背包问题**
```java
public int knapsack(int W, int[] weights, int[] values) {
    int n = weights.length;
    // dp[i][j] = 前 i 个物品，容量 j 时的最大价值
    int[][] dp = new int[n + 1][W + 1];
    
    for (int i = 1; i <= n; i++) {
        for (int j = 0; j <= W; j++) {
            dp[i][j] = dp[i - 1][j];  // 不选第 i 个物品
            if (j >= weights[i - 1]) {
                dp[i][j] = Math.max(dp[i][j], 
                    dp[i - 1][j - weights[i - 1]] + values[i - 1]);
            }
        }
    }
    return dp[n][W];
}

// 空间优化（一维）
public int knapsackOptimized(int W, int[] weights, int[] values) {
    int[] dp = new int[W + 1];
    
    for (int i = 0; i < weights.length; i++) {
        // 必须逆序遍历，避免重复选择
        for (int j = W; j >= weights[i]; j--) {
            dp[j] = Math.max(dp[j], dp[j - weights[i]] + values[i]);
        }
    }
    return dp[W];
}
```

**Q4: 编辑距离**
```java
public int minDistance(String word1, String word2) {
    int m = word1.length(), n = word2.length();
    // dp[i][j] = word1[0..i-1] 转换到 word2[0..j-1] 的最小操作数
    int[][] dp = new int[m + 1][n + 1];
    
    // 初始化
    for (int i = 0; i <= m; i++) dp[i][0] = i;
    for (int j = 0; j <= n; j++) dp[0][j] = j;
    
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (word1.charAt(i - 1) == word2.charAt(j - 1)) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j - 1],  // 替换
                               Math.min(dp[i - 1][j],      // 删除
                                        dp[i][j - 1]));    // 插入
            }
        }
    }
    return dp[m][n];
}
```

**Q5: 最长公共子序列 (LCS)**
```java
public int longestCommonSubsequence(String text1, String text2) {
    int m = text1.length(), n = text2.length();
    int[][] dp = new int[m + 1][n + 1];
    
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (text1.charAt(i - 1) == text2.charAt(j - 1)) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp[m][n];
}
```

---

## 二、贪心算法 (Greedy)

### 核心思想

每一步选择当前最优解，期望最终得到全局最优解。

**适用条件**：
1. **贪心选择性质**：局部最优能导致全局最优
2. **最优子结构**：问题的最优解包含子问题的最优解

### 经典问题

**Q1: 跳跃游戏**
```java
// 判断能否到达终点
public boolean canJump(int[] nums) {
    int maxReach = 0;
    for (int i = 0; i < nums.length; i++) {
        if (i > maxReach) return false;
        maxReach = Math.max(maxReach, i + nums[i]);
    }
    return true;
}

// 最少跳跃次数
public int jump(int[] nums) {
    int jumps = 0, curEnd = 0, curFarthest = 0;
    
    for (int i = 0; i < nums.length - 1; i++) {
        curFarthest = Math.max(curFarthest, i + nums[i]);
        if (i == curEnd) {
            jumps++;
            curEnd = curFarthest;
        }
    }
    return jumps;
}
```

**Q2: 区间调度**
```java
// 无重叠区间的最大数量
public int eraseOverlapIntervals(int[][] intervals) {
    if (intervals.length == 0) return 0;
    
    // 按结束时间排序
    Arrays.sort(intervals, (a, b) -> a[1] - b[1]);
    
    int count = 1;
    int end = intervals[0][1];
    
    for (int i = 1; i < intervals.length; i++) {
        if (intervals[i][0] >= end) {
            count++;
            end = intervals[i][1];
        }
    }
    return intervals.length - count;
}
```

**Q3: 分发饼干**
```java
public int findContentChildren(int[] g, int[] s) {
    Arrays.sort(g);
    Arrays.sort(s);
    
    int i = 0, j = 0;
    while (i < g.length && j < s.length) {
        if (s[j] >= g[i]) {
            i++;  // 满足一个孩子
        }
        j++;  // 使用一块饼干
    }
    return i;
}
```

---

## 三、回溯算法 (Backtracking)

### 核心思想

通过探索所有可能的解，遇到不满足条件的解时回退，继续搜索其他解。

**模板**：
```java
void backtrack(路径, 选择列表) {
    if (满足结束条件) {
        result.add(路径);
        return;
    }
    
    for (选择 : 选择列表) {
        做选择;
        backtrack(路径, 选择列表);
        撤销选择;
    }
}
```

### 经典问题

**Q1: 全排列**
```java
public List<List<Integer>> permute(int[] nums) {
    List<List<Integer>> result = new ArrayList<>();
    boolean[] used = new boolean[nums.length];
    backtrack(nums, new ArrayList<>(), used, result);
    return result;
}

private void backtrack(int[] nums, List<Integer> path, 
                       boolean[] used, List<List<Integer>> result) {
    if (path.size() == nums.length) {
        result.add(new ArrayList<>(path));
        return;
    }
    
    for (int i = 0; i < nums.length; i++) {
        if (used[i]) continue;
        
        used[i] = true;
        path.add(nums[i]);
        backtrack(nums, path, used, result);
        path.remove(path.size() - 1);
        used[i] = false;
    }
}
```

**Q2: 子集**
```java
public List<List<Integer>> subsets(int[] nums) {
    List<List<Integer>> result = new ArrayList<>();
    backtrack(nums, 0, new ArrayList<>(), result);
    return result;
}

private void backtrack(int[] nums, int start, List<Integer> path,
                       List<List<Integer>> result) {
    result.add(new ArrayList<>(path));
    
    for (int i = start; i < nums.length; i++) {
        path.add(nums[i]);
        backtrack(nums, i + 1, path, result);
        path.remove(path.size() - 1);
    }
}
```

**Q3: 组合总和**
```java
public List<List<Integer>> combinationSum(int[] candidates, int target) {
    List<List<Integer>> result = new ArrayList<>();
    backtrack(candidates, target, 0, new ArrayList<>(), result);
    return result;
}

private void backtrack(int[] candidates, int target, int start,
                       List<Integer> path, List<List<Integer>> result) {
    if (target == 0) {
        result.add(new ArrayList<>(path));
        return;
    }
    if (target < 0) return;
    
    for (int i = start; i < candidates.length; i++) {
        path.add(candidates[i]);
        backtrack(candidates, target - candidates[i], i, path, result);
        path.remove(path.size() - 1);
    }
}
```

**Q4: N 皇后**
```java
public List<List<String>> solveNQueens(int n) {
    List<List<String>> result = new ArrayList<>();
    char[][] board = new char[n][n];
    for (char[] row : board) {
        Arrays.fill(row, '.');
    }
    backtrack(board, 0, result);
    return result;
}

private void backtrack(char[][] board, int row, List<List<String>> result) {
    if (row == board.length) {
        result.add(constructBoard(board));
        return;
    }
    
    for (int col = 0; col < board.length; col++) {
        if (!isValid(board, row, col)) continue;
        
        board[row][col] = 'Q';
        backtrack(board, row + 1, result);
        board[row][col] = '.';
    }
}

private boolean isValid(char[][] board, int row, int col) {
    // 检查列
    for (int i = 0; i < row; i++) {
        if (board[i][col] == 'Q') return false;
    }
    // 检查左上对角线
    for (int i = row - 1, j = col - 1; i >= 0 && j >= 0; i--, j--) {
        if (board[i][j] == 'Q') return false;
    }
    // 检查右上对角线
    for (int i = row - 1, j = col + 1; i >= 0 && j < board.length; i--, j++) {
        if (board[i][j] == 'Q') return false;
    }
    return true;
}

private List<String> constructBoard(char[][] board) {
    List<String> result = new ArrayList<>();
    for (char[] row : board) {
        result.add(new String(row));
    }
    return result;
}
```

---

## 四、分治算法 (Divide and Conquer)

### 核心思想

将问题分解为多个相似的子问题，递归解决子问题，合并子问题的解。

**三步走**：
1. **分解**：将原问题分解为子问题
2. **解决**：递归求解子问题
3. **合并**：合并子问题的解

### 经典问题

**Q1: 归并排序**
```java
public void mergeSort(int[] nums, int left, int right) {
    if (left >= right) return;
    
    int mid = left + (right - left) / 2;
    mergeSort(nums, left, mid);
    mergeSort(nums, mid + 1, right);
    merge(nums, left, mid, right);
}

private void merge(int[] nums, int left, int mid, int right) {
    int[] temp = new int[right - left + 1];
    int i = left, j = mid + 1, k = 0;
    
    while (i <= mid && j <= right) {
        if (nums[i] <= nums[j]) {
            temp[k++] = nums[i++];
        } else {
            temp[k++] = nums[j++];
        }
    }
    while (i <= mid) temp[k++] = nums[i++];
    while (j <= right) temp[k++] = nums[j++];
    
    System.arraycopy(temp, 0, nums, left, temp.length);
}
```

**Q2: 快速排序**
```java
public void quickSort(int[] nums, int left, int right) {
    if (left >= right) return;
    
    int pivot = partition(nums, left, right);
    quickSort(nums, left, pivot - 1);
    quickSort(nums, pivot + 1, right);
}

private int partition(int[] nums, int left, int right) {
    int pivot = nums[right];
    int i = left;
    
    for (int j = left; j < right; j++) {
        if (nums[j] < pivot) {
            swap(nums, i, j);
            i++;
        }
    }
    swap(nums, i, right);
    return i;
}

private void swap(int[] nums, int i, int j) {
    int temp = nums[i];
    nums[i] = nums[j];
    nums[j] = temp;
}
```

**Q3: 数组中的第 K 个最大元素（快排思想）**
```java
public int findKthLargest(int[] nums, int k) {
    return quickSelect(nums, 0, nums.length - 1, nums.length - k);
}

private int quickSelect(int[] nums, int left, int right, int k) {
    if (left == right) return nums[left];
    
    int pivot = partition(nums, left, right);
    
    if (pivot == k) {
        return nums[pivot];
    } else if (pivot < k) {
        return quickSelect(nums, pivot + 1, right, k);
    } else {
        return quickSelect(nums, left, pivot - 1, k);
    }
}
```

---

## 五、滑动窗口

### 核心思想

维护一个可变窗口，通过移动窗口边界解决问题，常用于子数组/子串问题。

**模板**：
```java
public void slidingWindow(String s) {
    Map<Character, Integer> window = new HashMap<>();
    int left = 0, right = 0;
    
    while (right < s.length()) {
        // 扩大窗口
        char c = s.charAt(right);
        window.put(c, window.getOrDefault(c, 0) + 1);
        right++;
        
        // 收缩窗口
        while (满足收缩条件) {
            char d = s.charAt(left);
            window.put(d, window.get(d) - 1);
            left++;
        }
    }
}
```

### 经典问题

**Q1: 最长无重复子串**
```java
public int lengthOfLongestSubstring(String s) {
    Map<Character, Integer> window = new HashMap<>();
    int left = 0, maxLen = 0;
    
    for (int right = 0; right < s.length(); right++) {
        char c = s.charAt(right);
        window.put(c, window.getOrDefault(c, 0) + 1);
        
        while (window.get(c) > 1) {
            char d = s.charAt(left);
            window.put(d, window.get(d) - 1);
            left++;
        }
        maxLen = Math.max(maxLen, right - left + 1);
    }
    return maxLen;
}
```

**Q2: 最小覆盖子串**
```java
public String minWindow(String s, String t) {
    Map<Character, Integer> need = new HashMap<>();
    Map<Character, Integer> window = new HashMap<>();
    
    for (char c : t.toCharArray()) {
        need.put(c, need.getOrDefault(c, 0) + 1);
    }
    
    int left = 0, right = 0;
    int valid = 0;  // 满足条件的字符数
    int start = 0, len = Integer.MAX_VALUE;
    
    while (right < s.length()) {
        char c = s.charAt(right);
        right++;
        
        if (need.containsKey(c)) {
            window.put(c, window.getOrDefault(c, 0) + 1);
            if (window.get(c).equals(need.get(c))) {
                valid++;
            }
        }
        
        // 收缩窗口
        while (valid == need.size()) {
            if (right - left < len) {
                start = left;
                len = right - left;
            }
            
            char d = s.charAt(left);
            left++;
            
            if (need.containsKey(d)) {
                if (window.get(d).equals(need.get(d))) {
                    valid--;
                }
                window.put(d, window.get(d) - 1);
            }
        }
    }
    
    return len == Integer.MAX_VALUE ? "" : s.substring(start, start + len);
}
```

**Q3: 找到字符串中所有字母异位词**
```java
public List<Integer> findAnagrams(String s, String p) {
    List<Integer> result = new ArrayList<>();
    if (s.length() < p.length()) return result;
    
    int[] pCount = new int[26];
    int[] sCount = new int[26];
    
    for (char c : p.toCharArray()) {
        pCount[c - 'a']++;
    }
    
    int windowSize = p.length();
    for (int i = 0; i < s.length(); i++) {
        sCount[s.charAt(i) - 'a']++;
        
        if (i >= windowSize) {
            sCount[s.charAt(i - windowSize) - 'a']--;
        }
        
        if (Arrays.equals(sCount, pCount)) {
            result.add(i - windowSize + 1);
        }
    }
    return result;
}
```

---

## 六、双指针

### 核心思想

使用两个指针协同工作，减少时间复杂度。

**类型**：
1. **相向双指针**：两端向中间移动（如两数之和）
2. **同向双指针**：同向移动（如快慢指针）
3. **分离双指针**：分别遍历两个序列

### 经典问题

**Q1: 两数之和 II（有序数组）**
```java
public int[] twoSum(int[] numbers, int target) {
    int left = 0, right = numbers.length - 1;
    
    while (left < right) {
        int sum = numbers[left] + numbers[right];
        if (sum == target) {
            return new int[]{left + 1, right + 1};
        } else if (sum < target) {
            left++;
        } else {
            right--;
        }
    }
    return new int[]{};
}
```

**Q2: 三数之和**
```java
public List<List<Integer>> threeSum(int[] nums) {
    List<List<Integer>> result = new ArrayList<>();
    Arrays.sort(nums);
    
    for (int i = 0; i < nums.length - 2; i++) {
        // 跳过重复
        if (i > 0 && nums[i] == nums[i - 1]) continue;
        
        int left = i + 1, right = nums.length - 1;
        while (left < right) {
            int sum = nums[i] + nums[left] + nums[right];
            if (sum == 0) {
                result.add(Arrays.asList(nums[i], nums[left], nums[right]));
                // 跳过重复
                while (left < right && nums[left] == nums[left + 1]) left++;
                while (left < right && nums[right] == nums[right - 1]) right--;
                left++;
                right--;
            } else if (sum < 0) {
                left++;
            } else {
                right--;
            }
        }
    }
    return result;
}
```

**Q3: 接雨水**
```java
public int trap(int[] height) {
    int left = 0, right = height.length - 1;
    int leftMax = 0, rightMax = 0;
    int water = 0;
    
    while (left < right) {
        if (height[left] < height[right]) {
            if (height[left] >= leftMax) {
                leftMax = height[left];
            } else {
                water += leftMax - height[left];
            }
            left++;
        } else {
            if (height[right] >= rightMax) {
                rightMax = height[right];
            } else {
                water += rightMax - height[right];
            }
            right--;
        }
    }
    return water;
}
```

**Q4: 盛最多水的容器**
```java
public int maxArea(int[] height) {
    int left = 0, right = height.length - 1;
    int maxArea = 0;
    
    while (left < right) {
        int area = Math.min(height[left], height[right]) * (right - left);
        maxArea = Math.max(maxArea, area);
        
        if (height[left] < height[right]) {
            left++;
        } else {
            right--;
        }
    }
    return maxArea;
}
```

**Q5: 移除元素**
```java
public int removeElement(int[] nums, int val) {
    int slow = 0;
    for (int fast = 0; fast < nums.length; fast++) {
        if (nums[fast] != val) {
            nums[slow++] = nums[fast];
        }
    }
    return slow;
}
```

---

## 七、二分查找

### 核心思想

在有序数组中通过折半查找快速定位目标。

**模板**：
```java
// 标准二分查找
public int binarySearch(int[] nums, int target) {
    int left = 0, right = nums.length - 1;
    
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) {
            return mid;
        } else if (nums[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return -1;
}

// 查找左边界
public int leftBound(int[] nums, int target) {
    int left = 0, right = nums.length - 1;
    
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] >= target) {
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }
    
    if (left >= nums.length || nums[left] != target) {
        return -1;
    }
    return left;
}

// 查找右边界
public int rightBound(int[] nums, int target) {
    int left = 0, right = nums.length - 1;
    
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] <= target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    
    if (right < 0 || nums[right] != target) {
        return -1;
    }
    return right;
}
```

### 经典问题

**Q1: 搜索旋转排序数组**
```java
public int search(int[] nums, int target) {
    int left = 0, right = nums.length - 1;
    
    while (left <= right) {
        int mid = left + (right - left) / 2;
        
        if (nums[mid] == target) return mid;
        
        // 左半部分有序
        if (nums[left] <= nums[mid]) {
            if (target >= nums[left] && target < nums[mid]) {
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        } else {
            // 右半部分有序
            if (target > nums[mid] && target <= nums[right]) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
    }
    return -1;
}
```

**Q2: 寻找峰值**
```java
public int findPeakElement(int[] nums) {
    int left = 0, right = nums.length - 1;
    
    while (left < right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] > nums[mid + 1]) {
            right = mid;
        } else {
            left = mid + 1;
        }
    }
    return left;
}
```

---

## 八、位运算

### 常用技巧

```java
// 判断奇偶
boolean isOdd = (n & 1) == 1;

// 交换两数（不使用临时变量）
a ^= b;
b ^= a;
a ^= b;

// 找出只出现一次的数字（其他出现两次）
int singleNumber = 0;
for (int num : nums) {
    singleNumber ^= num;
}

// 获取最低位 1
int lowBit = n & (-n);

// 消除最低位 1
n = n & (n - 1);

// 判断是否是 2 的幂
boolean isPowerOfTwo = n > 0 && (n & (n - 1)) == 0;
```

### 经典问题

**Q1: 只出现一次的数字**
```java
public int singleNumber(int[] nums) {
    int result = 0;
    for (int num : nums) {
        result ^= num;
    }
    return result;
}
```

**Q2: 汉明距离**
```java
public int hammingDistance(int x, int y) {
    int xor = x ^ y;
    int count = 0;
    while (xor != 0) {
        count += xor & 1;
        xor >>>= 1;
    }
    return count;
}
```

**Q3: 比特位计数**
```java
public int[] countBits(int n) {
    int[] dp = new int[n + 1];
    for (int i = 1; i <= n; i++) {
        dp[i] = dp[i & (i - 1)] + 1;
    }
    return dp;
}
```

---

## 算法思想选择指南

| 问题特征 | 推荐方法 |
|----------|----------|
| 有重叠子问题、最优子结构 | 动态规划 |
| 每步选局部最优能达到全局最优 | 贪心 |
| 需要遍历所有可能解 | 回溯 |
| 可分解为独立子问题 | 分治 |
| 连续子数组/子串问题 | 滑动窗口 |
| 有序数组查找 | 二分查找 |
| 链表、数组原地操作 | 双指针 |
| 位操作相关 | 位运算 |

---

## 实战场景

### 场景1：设计红包算法
- **问题**：将金额随机分成 n 份
- **思路**：二倍均值法或线段切割法

### 场景2：限流算法
- **滑动窗口**：统计最近 N 秒的请求数
- **令牌桶**：按固定速率生成令牌

### 场景3：负载均衡选择
- **加权轮询**：滑动窗口平滑加权轮询

### 场景4：缓存淘汰策略
- **LRU**：哈希表 + 双向链表

---

## 延伸思考

1. **动态规划 vs 贪心** 什么时候用哪个？
2. **递归 vs 迭代** 如何转换？各有什么优缺点？
3. **空间换时间** 什么时候值得？
4. **算法复杂度优化** 如何从 O(n²) 优化到 O(n log n) 或 O(n)？

---

## 参考资料

- [LeetCode 热题 100](https://leetcode.cn/studyplan/top-100-liked/)
- [代码随想录](https://programmercarl.com/)
- [算法导论](https://mitpress.mit.edu/books/introduction-algorithms-fourth-edition)

---

*最后更新: 2026-04-09*