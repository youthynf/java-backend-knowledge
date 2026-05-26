# JUC工具类-Phaser详解

JUC工具类-Phaser详解
一、概述
Phaser（阶段器）是Java并发包（`java.util.concurrent`）中提供的一种可重用的同步屏障，它允许一组线程在多个阶段（phase）上同步执行。Phaser可以看作CyclicBarrier和CountDownLatch的增强版，支持更灵活的线程协调机制。

二、主要特点
•  动态调整参与者数量：可以在运行时注册register()或注销arriveAndDeregister()线程。
•  多阶段同步：支持多个阶段的同步，每个阶段都有一个phase编号（从0开始递增）。
• 分层结构：可以构建树形Phaser，减少竞争，提高性能。

三、Phaser核心原理
基本结构
Phaser内部维护以下关键状态：
•  phase（阶段号）：当前所处的阶段，初始为0，每次所有线程到达屏障后自动递增。
•  parties（参与者数量）：当前注册的线程数。
•  unarrived（未到达的线程数）：当前阶段尚未到达屏障的线程数。
•  termination（终止状态）：Phaser是否已终止。

主要方法
•  register()：注册一个新线程，增加parties计数 ；
•  arrive()：到达屏障但不等待其他线程（类似CountDownLatch.countDown()）；
•  arriveAndAwaitAdvance()：到达屏障并等待其他线程（类似CyclicBarrier.await()）；
•  arriveAndDeregister()：到达屏障并注销自己（减少parties计数） ；
•  onAdvance(phase, parties)：可重写的方法，用于阶段结束时执行额外逻辑；

四、Phaser工作流程
初始化：  

Phaser phaser = new Phaser(3); // 初始3个参与者

2. 线程到达屏障：

phaser.arriveAndAwaitAdvance(); // 等待所有线程到达

3. 阶段递增：
•  所有线程到达后，phase自动+1。
•  如果`onAdvance()`返回`true`，则Phaser终止。

示例代码

import java.util.concurrent.Phaser;

public class PhaserExample {
   public static void main(String[] args) {
       Phaser phaser = new Phaser(3); // 初始3个线程

       for (int i = 0; i < 3; i++) {
           new Thread(() -> {
               System.out.println(Thread.currentThread().getName() + " 到达阶段 0");
               phaser.arriveAndAwaitAdvance(); // 等待所有线程到达阶段0

               System.out.println(Thread.currentThread().getName() + " 到达阶段 1");
               phaser.arriveAndAwaitAdvance(); // 等待所有线程到达阶段1

               System.out.println(Thread.currentThread().getName() + " 完成");
           }).start();
       }
   }
}

// 输出
Thread-0 到达阶段 0
Thread-1 到达阶段 0
Thread-2 到达阶段 0
Thread-0 到达阶段 1
Thread-1 到达阶段 1
Thread-2 到达阶段 1
Thread-0 完成
Thread-1 完成
Thread-2 完成

五、Phaser vs CyclicBarrier vs CountDownLatch
•  动态调整线程数：Phaser✔️，CyclicBarrier❌，CountDownLatch❌；
•  多阶段支持：Phaser✔️，CyclicBarrier✔️（需手动重置），CountDownLatch❌；
•  可重用：Phaser✔️，CyclicBarrier✔️，CountDownLatch❌；
•  终止机制：Phaser✔️（onAdvance()），CyclicBarrier❌，CountDownLatch✔️（countDown() + await()）；

六、高级用法
动态增减参与者
Phaser允许在运行时动态调整参与同步的线程数量，比CyclicBarrier和CountDownLatch更灵活。任务分批执行示例：

import java.util.concurrent.Phaser;

public class DynamicRegistrationExample {
    public static void main(String[] args) {
        Phaser phaser = new Phaser(1); // 初始注册1个（主线程）

        // 启动3个任务线程
        for (int i = 0; i < 3; i++) {
            phaser.register(); // 动态注册新线程
            new Thread(new Task(phaser), "Thread-" + i).start();
        }

        // 主线程等待所有任务完成第一阶段
        phaser.arriveAndAwaitAdvance();
        System.out.println("第一阶段完成，当前 phase = " + phaser.getPhase());

        // 再启动2个新任务
        for (int i = 3; i < 5; i++) {
            phaser.register();
            new Thread(new Task(phaser), "Thread-" + i).start();
        }

        // 主线程等待所有任务完成第二阶段
        phaser.arriveAndAwaitAdvance();
        System.out.println("第二阶段完成，当前 phase = " + phaser.getPhase());

        phaser.arriveAndDeregister(); // 主线程退出
    }

    static class Task implements Runnable {
        private final Phaser phaser;

        Task(Phaser phaser) {
            this.phaser = phaser;
        }

        @Override
        public void run() {
            System.out.println(Thread.currentThread().getName() + " 开始执行");
            phaser.arriveAndAwaitAdvance(); // 等待所有线程到达

            System.out.println(Thread.currentThread().getName() + " 继续执行第二阶段");
            phaser.arriveAndDeregister(); // 执行完后注销自己
        }
    }
}

分层Phaser（减少竞争）
当线程数量很大时，单个Phaser可能成为性能瓶颈，可以使用分层Phaser（树形结构）减少竞争。

import java.util.concurrent.Phaser;

public class TieredPhaserExample {
    public static void main(String[] args) {
        final int TASK_COUNT = 16;
        Phaser rootPhaser = new Phaser();

        // 创建4个子Phaser，每个管理4个任务
        for (int i = 0; i < 4; i++) {
            Phaser childPhaser = new Phaser(rootPhaser); // 绑定到rootPhaser
            for (int j = 0; j < 4; j++) {
                new Thread(new Worker(childPhaser), "Worker-" + (i * 4 + j)).start();
            }
        }
    }

    static class Worker implements Runnable {
        private final Phaser phaser;

        Worker(Phaser phaser) {
            this.phaser = phaser;
        }

        @Override
        public void run() {
            System.out.println(Thread.currentThread().getName() + " 开始阶段0");
            phaser.arriveAndAwaitAdvance();

            System.out.println(Thread.currentThread().getName() + " 开始阶段1");
            phaser.arriveAndDeregister(); // 任务完成后注销
        }
    }
}
适用于大量线程的场景，减少单个Phaser的竞争。rootPhaser管理4个子Phaser，每个子Phaser管理4个线程，减少单个Phaser的竞争，提高并发性能。

自定义onAdvance()
可以覆盖onAdvance()方法，在阶段结束时执行自定义逻辑，并决定是否终止Phaser。示例：限制最大阶段数：

import java.util.concurrent.Phaser;

public class OnAdvanceExample {
    public static void main(String[] args) {
        Phaser phaser = new Phaser(3) {
            @Override
            protected boolean onAdvance(int phase, int registeredParties) {
                System.out.println("阶段 " + phase + " 完成，注册线程数=" + registeredParties);
                return phase >= 2 || registeredParties == 0; // 阶段>=2 或 无参与者时终止
            }
        };

        for (int i = 0; i < 3; i++) {
            new Thread(() -> {
                System.out.println(Thread.currentThread().getName() + " 到达阶段0");
                phaser.arriveAndAwaitAdvance();

                System.out.println(Thread.currentThread().getName() + " 到达阶段1");
                phaser.arriveAndAwaitAdvance();

                System.out.println(Thread.currentThread().getName() + " 到达阶段2");
                phaser.arriveAndDeregister();
            }).start();
        }
    }
}

超时控制（结合awaitAdvanceInterruptibly）
Phaser本身不直接支持超时，但可以结合awaitAdvanceInterruptibly()实现超时等待。

import java.util.concurrent.Phaser;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public class TimeoutExample {
    public static void main(String[] args) {
        Phaser phaser = new Phaser(2);

        new Thread(() -> {
            try {
                Thread.sleep(3000); // 模拟长时间任务
                phaser.arrive();
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }).start();

        try {
            System.out.println("主线程等待阶段0完成（超时2秒）");
            phaser.awaitAdvanceInterruptibly(0, 2, TimeUnit.SECONDS);
            System.out.println("阶段0完成");
        } catch (TimeoutException e) {
            System.out.println("等待超时！");
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }
}

七、适用场景
•  分阶段任务（如多轮游戏、批量数据处理）
•  动态线程池协调
•  替代CyclicBarrier和CountDownLatch

八、总结
•  Phaser是一种多阶段同步器，比CyclicBarrier和CountDownLatch更灵活。
•  支持动态调整线程数、多阶段同步和分层结构。
•  适用于分批次任务或需要动态协调线程的场景。
Phaser是Java并发编程中的高级工具，合理使用可以简化复杂的线程同步问题。
