# volatile基本原理详解

volatile基本原理详解
概述
volatile关键字是Java中用于处理多线程环境下的变量的一种轻量级同步机制，其核心作用是确保变量的可见性和有序性，但不保证原子性。
•  可见性：一个线程修改了volatile变量的值，其他线程会立即看到这个新值；
•  有序性：防止JVM和CPU对volatile变量相关的指令进行重排序优化，从而保证了操作的顺序性；
实现原理
JVM层面
•  写操作：强制将线程本地内存变量刷新到主内存；
•  读操作：是本地内存的变量失效，直接从主内存读取最新值；
硬件层面（内存屏障）
volatile变量的读写会插入对应的内存屏障指令，确保顺序性和可见性。
•  在每个volatile写操作前面插入一个StoreStore屏障：禁止上面的普通写和下面的volatile写重排序；
•  在每个volatile写操作后面插入一个StoreLoad屏障：禁止上面的volatile写于下面可能有的volatile读写重排序；
•  在每个volatile读操作后面插入一个LoadStore屏障：禁止下面所有的普通写和上面的volatile读重排序；
•  在每个volatile读操作后面插入一个LoadLoad屏障：禁止下面所有的普通读和上面的volatile读重排序；
内存屏障原理解析
volatile变量的内存可见性是基于硬件层面的内存屏障（Memory Barrier）来实现的。内存屏障又称为内存栅栏，是一个CPU指令。通过插入特定类型的内存屏障来禁止特定类型的编译器重排序和处理器重排序，告诉编译器和CPU不管什么指令都不能和这条内存屏障指令重排序。
lock前缀指令在多核处理器下会引发两件事情：
•  将当前处理器缓存行的数据写回到系统内存；
•  写回内存的操作会使在其他CPU里缓存了该内存地址的数据无效。
如果对声明了volatile的变量进行写操作，JVM就会向处理器发送一条lock前缀的指令，将这个变量所在的缓存行数据写回到系统内存；而读取操作则会清空本地缓存，并重新从主内存中读取数据。这种机制保证了变量的值在多线程间的一致性。
为了保证各个处理器的缓存是一致的，实现了缓存一致性协议（MESI）,每个处理器通过嗅探在总线上传播的数据来检查自己缓存的值是不是过期了，当处理器发现自己缓存行对应的内存地址被修改，就会将当前处理器的缓存行设置为无效状态，当处理器对这个数据进行修改操作的时候，会重新从系统内存中把数据读取到处理器缓存里。所有多核处理器发现本地缓存失效后，就会从内存中重读该变量数据，即可以获取当前的最新值。
常见误区
误解为原子性
volatile不能保证符合操作的原子性，因此不能用于实现复杂的同步逻辑；
误以为线程安全
volatile仅保证了变量的可见性和有序性，但不能保证线程安全。多个线程同时对volatile变量进行写操作时，仍然可能出现竞态条件；
适用场景
状态标志

volatile boolean running = true;

public void start() {
    new Thread(() -> {
        while (running) {  // 无锁读取
            // 执行任务
        }
    }).start();
}

public void stop() {
    running = false;  // 无锁修改
}

单例模式（DCL双检锁）

private static volatile Singleton instance;

public static Singleton getInstance() {
    if (instance == null) {
        synchronized (Singleton.class) {
            if (instance == null) {
                instance = new Singleton();  // 防止指令重排
            }
        }
    }
    return instance;
}

独立观察（发布-订阅模式）

volatile String latestData;

// 发布者
public void updateData(String data) {
    latestData = data;  // 写 volatile
}

// 订阅者
public String getLatestData() {
    return latestData;  // 读 volatile
}
