# JUC工具类-CyclicBarrier详解

JUC工具类-CyclicBarrier详解
一、概述
CyclicBarrier（循环屏障）是Java并发包中的另一种同步工具类，它允许一组线程互相等待，直到所有线程都到达某个屏障点（barrier point）后再继续执行。与CountDownLatch不同，CyclicBarrier是可重用的。
二、核心原理
1. 内部实现
CyclicBarrier同样基于AQS实现，主要包含以下关键部分：
•  屏障点（parties）：需要等待的线程数量
•  当前等待线程数（count）：尚未到达屏障的线程数
•  Generation：表示屏障的一次使用周期
•  可选的Runnable命令：当所有线程到达屏障后执行

2. 工作流程
•  初始化：创建CyclicBarrier时指定参与线程数和可选屏障动作

CyclicBarrier barrier = new CyclicBarrier(3, () -> System.out.println("所有线程已到达屏障"));

// CyclicBarrier(int, Runnable)型构造函数
public CyclicBarrier(int parties, Runnable barrierAction) {
    // 参与的线程数量小于等于0，抛出异常
    if (parties <= 0) throw new IllegalArgumentException();
    // 设置parties
    this.parties = parties;
    // 设置count
    this.count = parties;
    // 设置barrierCommand
    this.barrierCommand = barrierAction;
}

// CyclicBarrier(int)型构造函数
public CyclicBarrier(int parties) {
    // 调用含有两个参数的构造函数
    this(parties, null);
}

•  线程到达屏障：每个线程调用await()方法

barrier.await();

•  等待其他线程：调用await()的线程会被阻塞，直到所有线程都调用了await()
•  屏障触发：当最后一个线程调用await()后：
- 执行可选的Runnable命令（如果有）
- 唤醒所有等待线程
- 重置屏障以便下次使用

三、源码分析
1. 类继承关系
CyclicBarrier没有显式继承哪个父类或者实现哪个接口，所有的AQS和重入锁不是通过继承实现的，而是通过组合实现的。

public class CyclicBarrier {
    
    /** The lock for guarding barrier entry */
    // 可重入锁
    private final ReentrantLock lock = new ReentrantLock();
    /** Condition to wait on until tripped */
    // 条件队列
    private final Condition trip = lock.newCondition();
    /** The number of parties */
    // 参与的线程数量
    private final int parties;
    /* The command to run when tripped */
    // 由最后一个进入 barrier 的线程执行的操作
    private final Runnable barrierCommand;
    /** The current generation */
    // 当前代
    private Generation generation = new Generation();
    // 正在等待进入屏障的线程数量
    private int count;
}

2. 核心数据结构
CyclicBarrier类存在一个内部类Generation，每一次使用的CycBarrier可以当成Generation的实例，其源代码如下

private static class Generation {
   boolean broken = false;
}

3. 核心方法实现
•  await()方法

public int await() throws InterruptedException, BrokenBarrierException {
   try {
       return dowait(false, 0L);
   } catch (TimeoutException toe) {
       throw new Error(toe); // cannot happen
   }
}

private int dowait(boolean timed, long nanos)
   throws InterruptedException, BrokenBarrierException, TimeoutException {
   final ReentrantLock lock = this.lock;
   lock.lock();
   try {
       final Generation g = generation;
       
       if (g.broken)
           throw new BrokenBarrierException();
           
       if (Thread.interrupted()) {
           breakBarrier();
           throw new InterruptedException();
       }
       
       int index = --count;
       if (index == 0) {  // 最后一个到达的线程
           boolean ranAction = false;
           try {
               final Runnable command = barrierCommand;
               if (command != null)
                   command.run();
               ranAction = true;
               nextGeneration();
               return 0;
           } finally {
               if (!ranAction)
                   breakBarrier();
           }
       }
       
       // 不是最后一个到达的线程
       for (;;) {
           try {
               if (!timed)
                   trip.await();
               else if (nanos > 0L)
                   nanos = trip.awaitNanos(nanos);
           } catch (InterruptedException ie) {
               if (g == generation && !g.broken) {
                   breakBarrier();
                   throw ie;
               } else {
                   Thread.currentThread().interrupt();
               }
           }
           
           if (g.broken)
               throw new BrokenBarrierException();
               
           if (g != generation)
               return index;
               
           if (timed && nanos <= 0L) {
               breakBarrier();
               throw new TimeoutException();
           }
       }
   } finally {
       lock.unlock();
   }
}

•  重置相关方法

private void nextGeneration() {
   trip.signalAll();
   count = parties;
   generation = new Generation();
}

private void breakBarrier() {
   generation.broken = true;
   count = parties;
   trip.signalAll();
}

四、使用场景
1. 多线程计算数据，最后合并结果

CyclicBarrier barrier = new CyclicBarrier(5, () -> {
    System.out.println("所有线程计算完成，开始合并结果");
});
  
for (int i = 0; i < 5; i++) {
    new Thread(() -> {
        // 计算部分数据
        barrier.await();
        // 合并结果
    }).start();
  }

2. 模拟并发测试

CyclicBarrier barrier = new CyclicBarrier(THREAD_COUNT);
  
for (int i = 0; i < THREAD_COUNT; i++) {
    new Thread(() -> {
        barrier.await(); // 等待所有线程准备就绪
        // 执行测试逻辑
    }).start();
}

3. 多阶段任务处理

CyclicBarrier barrier = new CyclicBarrier(3, () -> {
    System.out.println("当前阶段所有任务已完成");
});
  
// 每个阶段完成后调用await()

五、注意事项
1. 屏障异常处理：
•  如果一个线程在等待时被中断或超时，会抛出BrokenBarrierException
•  其他等待的线程也会收到BrokenBarrierException

2. 重置机制：
•  调用reset()方法可以手动重置屏障
•  重置时如果有线程正在等待，会抛出BrokenBarrierException

3. 性能考虑：
•  屏障动作应尽量简短，避免长时间阻塞其他线程
•  对于大量线程，考虑使用分层的屏障设计

4. 与CountDownLatch的区别：
•  CyclicBarrier是可重用的，CountDownLatch只能使用一次
•  CyclicBarrier的计数器是递增的，CountDownLatch是递减的
•  CyclicBarrier强调线程间的相互等待，CountDownLatch强调一个/多个线程等待其他线程

六、高级用法
1. 超时等待：

try {
      barrier.await(10, TimeUnit.SECONDS);
  } catch (TimeoutException e) {
      // 处理超时
  }

2. 组合使用：

// 第一阶段使用CountDownLatch
  CountDownLatch initLatch = new CountDownLatch(1);
  // 第二阶段使用CyclicBarrier
  CyclicBarrier processBarrier = new CyclicBarrier(5);

3. 分层屏障：

// 创建多个CyclicBarrier实现分阶段同步
public class HierarchicalBarrier {
    private final CyclicBarrier globalBarrier;    // 全局屏障
    private final CyclicBarrier[] localBarriers;  // 局部屏障数组
    private final int groupSize;                  // 每组线程数
    
    public HierarchicalBarrier(int numThreads, int groupSize) {
        this.groupSize = groupSize;
        int numGroups = (numThreads + groupSize - 1) / groupSize; // 计算组数
        
        // 初始化全局屏障（每组一个代表参与）
        this.globalBarrier = new CyclicBarrier(numGroups);
        
        // 初始化局部屏障
        this.localBarriers = new CyclicBarrier[numGroups];
        for (int i = 0; i < numGroups; i++) {
            int actualGroupSize = Math.min(groupSize, numThreads - i * groupSize);
            localBarriers[i] = new CyclicBarrier(actualGroupSize);
        }
    }
    
    public void await(int threadId) throws InterruptedException, BrokenBarrierException {
        int groupId = threadId / groupSize;
        int localId = threadId % groupSize;
        
        // 第一阶段：组内同步
        int arrivalIndex = localBarriers[groupId].await();
        
        // 每组第一个到达的线程作为代表参与全局同步
        if (arrivalIndex == 0) {
            globalBarrier.await();
        }
        
        // 第二阶段：组内同步（确保所有线程都收到全局同步完成的通知）
        localBarriers[groupId].await();
    }
}

public class HierarchicalBarrierDemo {
    public static void main(String[] args) {
        int totalThreads = 12;
        int groupSize = 4;
        
        HierarchicalBarrier barrier = new HierarchicalBarrier(totalThreads, groupSize);
        
        for (int i = 0; i < totalThreads; i++) {
            final int threadId = i;
            new Thread(() -> {
                try {
                    System.out.println("Thread " + threadId + " 开始工作");
                    Thread.sleep((long)(Math.random() * 1000));
                    
                    System.out.println("Thread " + threadId + " 到达局部屏障");
                    barrier.await(threadId);
                    
                    System.out.println("Thread " + threadId + " 继续执行");
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }).start();
        }
    }
}

public class MultiLevelBarrier {
    private final HierarchicalBarrier[] levelBarriers;
    private final int[] levelGroupSizes;
    
    public MultiLevelBarrier(int numThreads, int[] groupSizesPerLevel) {
        this.levelGroupSizes = groupSizesPerLevel;
        this.levelBarriers = new HierarchicalBarrier[groupSizesPerLevel.length];
        
        int currentSize = numThreads;
        for (int i = 0; i < groupSizesPerLevel.length; i++) {
            levelBarriers[i] = new HierarchicalBarrier(currentSize, groupSizesPerLevel[i]);
            currentSize = (currentSize + groupSizesPerLevel[i] - 1) / groupSizesPerLevel[i];
        }
    }
    
    public void await(int threadId) throws InterruptedException, BrokenBarrierException {
        int currentId = threadId;
        for (HierarchicalBarrier barrier : levelBarriers) {
            currentId = barrier.getRepresentativeId(currentId);
            barrier.await(currentId);
        }
    }
}
CyclicBarrier适合需要多次同步的场景，特别是需要所有线程都完成某个阶段后才能进入下一阶段的场景。正确使用可以简化复杂的线程同步逻辑。

七、对比CountDonwLatch
•  CountDownLatch减计数，CyclicBarrier加计数。
•  CountDownLatch是一次性的，CyclicBarrier可以重用。
•  CountDownLatch和CyclicBarrier都有让多个线程等待同步然后再开始下一步动作的意思，但是CountDownLatch的下一步的动作实施者是主线程，具有不可重复性；而CyclicBarrier的下一步动作实施者还是“其他线程”本身，具有往复多次实施动作的特点。
