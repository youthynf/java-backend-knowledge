# Java基础线程机制是怎么样的？

Java基础线程机制是怎么样的？
Executor
Executor管理多个异步任务的执行，而无需程序员显式地管理线程的生命周期。这里的异步是指多个任务的执行互不干扰，不需要进行同步操作。主要有三种Executor：
a. CachedThreadPool：一个任务创建一个线程；
b. FixedThreadPool：所有任务只能使用固定数量的线程；
c. SingleThreadExecutor：相当于大小为1的FixedThreadPool。

public static void main(String[] args) {
    ExecutorService executorService = Executors.newCachedThreadPool();
    for (int i = 0; i < 5; i++) {
        executorService.execute(new MyRunnable());
    }
    executorService.shutdown();
}

Daemon
守护线程是程序运行时在后台提供服务的进程。当所有非守护线程结束时，程序也就终止了，同时杀死所有守护线程。main()属于非守护线程，使用setDaemon()方法将一个线程设置为守护线程。

public static void main(String[] args) {
    Thread thread = new Thread(new MyRunnable());
    thread.setDaemon(true);
}

sleep()
Thread.sleep(millisec)方法会休眠当前正在执行的线程，millisec单位为毫秒。sleep()可能会抛出InterruptedException，因为异常不能跨线程传播会main()中，因此必须在本地进行处理的。

public void run() {
    try {
        Thread.sleep(3000);
    } catch (InterruptedException e) {
        e.printStackTrace();
    }
}

yeild()
对静态方法Thread.yield()的调用声明了当前线程已经完成了生命周期中最重要的部分，可以切换给其他线程来执行。该方法只是对线程调度的一个建议，而且也只是建议具有相同优先级的其他线程可以运行。

public void run() {
    Thread.yield();
}
