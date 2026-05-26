# Java线程的创建方式有哪些？

Java线程的创建方式有哪些？
线程使用方式：
实现Runnable接口
实现Runnable接口，并实现run()方法，通过Thread调用start()方法来启动线程。

public class MyRunnable implements Runnable {
    public void run() {
        // ...
    }
}

public static void main(String[] args) {
    MyRunnable instance = new MyRunnable();
    Thread thread = new Thread(instance);
    thread.start();
}

实现Callable接口
与Runnable相比，Callable可以有返回值，返回值通过FuruteTask进行封装。

public class MyCallable implements Callable<Integer> {
    public Integer call() {
        return 123;
    }
}

public static void main(String[] args) throws ExecutionException, InterruptedException {
    MyCallable mc = new MyCallable();
    FutureTask<Integer> ft = new FutureTask<>(mc);
    Thread thread = new Thread(ft);
    thread.start();
    System.out.println(ft.get());
}

继承Thread类
同样需要实现run()方法，因为Thread类也实现了Runable接口。当调用start()方法启动一个线程时，虚拟机会将线程放入就绪队列中等待被调度，当一个线程被调度时会执行该线程的run()方法。

public class MyThread extends Thread {
    public void run() {
        // ...
    }
}

public static void main(String[] args) {
    MyThread mt = new MyThread();
    mt.start();
}

实现接口 VS 继承Thread
实现接口会好一些，因为Java不支持多重继承，因此继承了Thread类就无法继承其他类，但是可以实现多个接口，而且大多数时候只要求可执行就行，继承整个Thread类开销较大。
