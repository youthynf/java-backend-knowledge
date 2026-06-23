# Java IO之I/O多路复用详解

Java IO之I/O多路复用详解
典型的多路复用IO实现
目前流程的多路IO实现主要有四种: select, poll, epoll, kqueue.
•  select: 性能相对较高, 用于实现Reactor模型, 支持windows和Linux系统, 支持Java, Linux操作系统的kernels2.4内核版本之前默认使用select, 而目前windows下对同步IO的支持都是select模型;
•  poll: 性能相对较高, 用于实现Reactor模型, 是Linux下的JAVA NIO框架, Linux kernels2.6版本之前使用poll支持, 也是使用的Reactor模式;
•  epoll: 性能高, 用于实现Reacor/Proactor模型, 是Linux的kernels2.6内核版本及以后使用epoll进行支持, 2.6内核版本之前使用poll支持. 此外, 由于Linux下没有windows下的IOCP技术提供真正的异步IO支持, 所以Linux下使用epoll模拟异步IO;
•  kqueue: 性能高, 用于实现Proactor模型, 目前的JAVA版本不支持.

传统IO模型
对于传统IO模型，其主要是一个Server对接N个客户端，在客户端连接之后，为每个客户端都分配一个执行线程。主要特点:
•  每个客户端连接到达之后，服务端会分配一个线程给该客户端，该线程会处理包括读取数据，解码，业务计算，编码，以及发送数据整个过程；
•  同一时刻，服务端的吞吐量与服务器所提供的线程数量是呈线性关系的。

这种设计模式在客户端连接不多，并发量不大的情况下是可以运行得很好的，但是在海量并发的情况下，这种模式就显得力不从心了。这种模式主要存在的问题有如下几点：
•  服务器的并发量对服务端能够创建的线程数有很大的依赖关系，但是服务器线程却是不能无限增长的；
•  服务端每个线程不仅要进行IO读写操作，而且还需要进行业务计算；
•  服务端在获取客户端连接，读取数据，以及写入数据的过程都是阻塞类型的，在网络状况不好的情况下，这将极大的降低服务器每个线程的利用率，从而降低服务器吞吐量。

Reactor事件驱动模型
在传统IO模型中, 由于线程在等待连接以及进行IO操作时都会阻塞当前线程, 这部分损耗是非常大的. 因而JDK1.4中就提供了一套非阻塞IO的API. 该API本质上是以事件驱动来处理网络事件的, 而Reactor是基于该API提出的一套IO模型.

1. Reactor模型(单Reactor单线程)
在Reactor模型中，主要拆分四个角色，分别是客户端连接，Reactor，Acceptor，Handler。其中Acceptor会不断地接收客户端的连接，然后将接收到的连接交由Reactor进行分发, 并由具体的Handler进行处理。

改进后的Reactor模型相对于传统的IO模型主要有如下优点：
•  Reactor模型是以事件进行驱动的，其能够将接收客户端连接, 网络读写，以及业务计算进行拆分，从而极大的提升处理效率；
•  Reactor模型是异步非阻塞模型，工作线程在没有网络事件时可以处理其他的任务，而不用像传统IO那样必须阻塞等待。

代码示例:

public class SingleReactorSingleThread {
    public static void main(String[] args) throws IOException {
        Selector selector = Selector.open();
        ServerSocketChannel serverChannel = ServerSocketChannel.open();
        serverChannel.bind(new InetSocketAddress(8080));
        serverChannel.configureBlocking(false);
        serverChannel.register(selector, SelectionKey.OP_ACCEPT);

        while (true) {
            selector.select();
            Iterator<SelectionKey> keys = selector.selectedKeys().iterator();
            while (keys.hasNext()) {
                SelectionKey key = keys.next();
                keys.remove();
                if (key.isAcceptable()) {
                    SocketChannel clientChannel = serverChannel.accept();
                    clientChannel.configureBlocking(false);
                    clientChannel.register(selector, SelectionKey.OP_READ);
                    System.out.println("客户端连接: " + clientChannel.getRemoteAddress());
                } else if (key.isReadable()) {
                    SocketChannel clientChannel = (SocketChannel) key.channel();
                    ByteBuffer buffer = ByteBuffer.allocate(1024);
                    int bytesRead = clientChannel.read(buffer);
                    if (bytesRead > 0) {
                        buffer.flip();
                        String request = new String(buffer.array(), 0, bytesRead).trim();
                        System.out.println("收到请求: " + request);
                        // 构建响应
                        String response = "HTTP/1.1 200 OK\r\nContent-Length: 13\r\n\r\nHello, Client!";
                        ByteBuffer responseBuffer = ByteBuffer.wrap(response.getBytes());
                        // 尝试直接写入
                        int bytesWritten = clientChannel.write(responseBuffer);
                        // 如果未写完，注册OP_WRITE
                        if (responseBuffer.hasRemaining()) {
                            key.interestOps(SelectionKey.OP_WRITE);
                            key.attach(responseBuffer); // 保存未写完的数据
                        } else {
                            clientChannel.close(); // 短连接示例
                        }
                    }
                } else if (key.isWritable()) {
                    SocketChannel clientChannel = (SocketChannel) key.channel();
                    ByteBuffer remainingBuffer = (ByteBuffer) key.attachment();
                    // 继续写入剩余数据
                    clientChannel.write(remainingBuffer);
                    if (!remainingBuffer.hasRemaining()) {
                        key.interestOps(SelectionKey.OP_READ); // 恢复监听读事件
                        clientChannel.close(); // 或保持连接
                    }
                }
            }
        }
    }
}

2. Reactor模型(单Reactor多线程)：业务处理与IO分离
由于网络读写和业务操作都在单个线程中，在并发情况下，这里的系统瓶颈主要是两个方面：
•  高频率的网络读写时间处理;
•  大量的业务操作处理;
基于上述两个问题，这里在单线程Reactor模型的基础上，提出了使用线程池的方式处理业务逻辑，该模式的主要特点是：
•  使用一个线程进行客户端连接的以及网络读写事件的处理；
•  在接收到客户端连接之后，将该连接交由线程池进行数据的编解码以及业务计算；
这种模式相对于前面的模式性能有了很大提升，主要在于进行网络读写的同时，也进行业务计算，从而大大提升了系统的吞吐率；但是这个模式也存在一个问题，就是网络读写是一个比较消耗CPU的操作，在高并发的情况下，将会有大量的客户端数据需要进行网络读写，此时一个线程将不足以处理这么多请求。

代码示例:

public class SingleReactorMultiThread {
    private static ExecutorService workerPool = Executors.newFixedThreadPool(4);

    public static void main(String[] args) throws IOException {
        Selector selector = Selector.open();
        ServerSocketChannel serverChannel = ServerSocketChannel.open();
        serverChannel.bind(new InetSocketAddress(8080));
        serverChannel.configureBlocking(false);
        serverChannel.register(selector, SelectionKey.OP_ACCEPT);

        while (true) {
            selector.select();
            Iterator<SelectionKey> keys = selector.selectedKeys().iterator();
            while (keys.hasNext()) {
                SelectionKey key = keys.next();
                keys.remove();
                if (key.isAcceptable()) {
                    SocketChannel clientChannel = serverChannel.accept();
                    clientChannel.configureBlocking(false);
                    clientChannel.register(selector, SelectionKey.OP_READ);
                    System.out.println("客户端连接: " + clientChannel.getRemoteAddress());
                } else if (key.isReadable()) {
                    // 提交任务到线程池处理请求并生成响应
                    workerPool.submit(() -> {
                        try {
                            SocketChannel clientChannel = (SocketChannel) key.channel();
                            ByteBuffer buffer = ByteBuffer.allocate(1024);
                            int bytesRead = clientChannel.read(buffer);
                            if (bytesRead > 0) {
                                buffer.flip();
                                String request = new String(buffer.array(), 0, bytesRead).trim();
                                System.out.println("收到请求: " + request);
                                // 模拟业务处理
                                String response = "HTTP/1.1 200 OK\r\nContent-Length: 13\r\n\r\nHello, Client!";
                                ByteBuffer responseBuffer = ByteBuffer.wrap(response.getBytes());
                                // 主线程处理写操作（需同步）
                                synchronized (clientChannel) {
                                    clientChannel.write(responseBuffer);
                                    clientChannel.close();
                                }
                            }
                        } catch (IOException e) {
                            e.printStackTrace();
                        }
                    });
                }
            }
        }
    }
}

3. Reactor模型(主从Reactor)：并发读写
对于使用线程池处理业务操作的模型，由于网络读写在高并发情况下会成为系统的一个瓶颈，因此提出了一种改进后的模型，即使用线程池进行网络读写，而仅仅使用一个线程专门接受客户端连接。

这种改进后的Reactor模型将Reactor拆分了mainReactor和subReactor。这里的mainReactor主要进行客户端连接的处理，处理完之后将连接交由subReactor来处理客户端的网络读写。这里的subReactor则是使用一个线程池来支撑的，器读写能力随着线程数的增多而大大增加。对于业务操作，这里也是使用一个线程池，而每个业务请求都只需要进行编解码和业务计算。通过这种方式，服务器的性能将会大大提升，基本能支持百万连接。

示例代码:

public class MasterSlaveReactor {
    public static void main(String[] args) throws IOException {
        Selector masterSelector = Selector.open();
        ServerSocketChannel serverChannel = ServerSocketChannel.open();
        serverChannel.bind(new InetSocketAddress(8080));
        serverChannel.configureBlocking(false);
        serverChannel.register(masterSelector, SelectionKey.OP_ACCEPT);

        // 子Reactor线程
        ExecutorService subReactors = Executors.newFixedThreadPool(2);
        subReactors.submit(() -> {
            try {
                Selector slaveSelector = Selector.open();
                while (true) {
                    slaveSelector.select();
                    Iterator<SelectionKey> keys = slaveSelector.selectedKeys().iterator();
                    while (keys.hasNext()) {
                        SelectionKey key = keys.next();
                        keys.remove();
                        if (key.isReadable()) {
                            SocketChannel clientChannel = (SocketChannel) key.channel();
                            ByteBuffer buffer = ByteBuffer.allocate(1024);
                            int bytesRead = clientChannel.read(buffer);
                            if (bytesRead > 0) {
                                buffer.flip();
                                String request = new String(buffer.array(), 0, bytesRead).trim();
                                System.out.println("收到请求: " + request);
                                // 模拟业务处理
                                String response = "HTTP/1.1 200 OK\r\nContent-Length: 13\r\n\r\nHello, Client!";
                                ByteBuffer responseBuffer = ByteBuffer.wrap(response.getBytes());
                                // 尝试直接写入
                                int bytesWritten = clientChannel.write(responseBuffer);
                                if (responseBuffer.hasRemaining()) {
                                    key.interestOps(SelectionKey.OP_WRITE);
                                    key.attach(responseBuffer);
                                } else {
                                    clientChannel.close();
                                }
                            }
                        } else if (key.isWritable()) {
                            SocketChannel clientChannel = (SocketChannel) key.channel();
                            ByteBuffer remainingBuffer = (ByteBuffer) key.attachment();
                            clientChannel.write(remainingBuffer);
                            if (!remainingBuffer.hasRemaining()) {
                                key.interestOps(SelectionKey.OP_READ);
                                clientChannel.close();
                            }
                        }
                    }
                }
            } catch (IOException e) {
                e.printStackTrace();
            }
        });

        // 主Reactor循环
        while (true) {
            masterSelector.select();
            Iterator<SelectionKey> keys = masterSelector.selectedKeys().iterator();
            while (keys.hasNext()) {
                SelectionKey key = keys.next();
                keys.remove();
                if (key.isAcceptable()) {
                    SocketChannel clientChannel = serverChannel.accept();
                    clientChannel.configureBlocking(false);
                    // 将新连接分配给子Reactor
                    subReactors.submit(() -> {
                        try {
                            Selector slaveSelector = Selector.open();
                            clientChannel.register(slaveSelector, SelectionKey.OP_READ);
                            slaveSelector.wakeup();
                        } catch (IOException e) {
                            e.printStackTrace();
                        }
                    });
                }
            }
        }
    }
}

针对是否需要注册 OP_WRITE问题
不需要注册的情况（大多数场景）：
如果响应数据可以一次性写入Socket缓冲区（例如短响应），直接调用channel.write()即可。
非阻塞模式下，write()方法会立即返回实际写入的字节数，若缓冲区已满，可能只写入部分数据，但通常HTTP响应较小，可以一次性写完。

需要注册的情况：
响应数据较大（如文件传输），且首次write()未能完全写入时，需注册OP_WRITE，待通道可写时继续写入剩余数据。
需要精确控制写事件的场景（如高并发下的流量控制）。

Proactor模型
Proactor 模型是一种高性能的异步 I/O 设计模式，与 Reactor 模型形成对比。以下是 Proactor 模型的全面解析：
核心概念
Proactor 模式基于"完成通知"机制，主要特点包括：
•  异步操作：应用程序发起 I/O 操作后立即返回，不阻塞
•  完成回调：操作系统在 I/O 操作完成后主动通知应用程序
•  解耦设计：将事件发起和事件处理分离

核心组件
•  Initiator: 发起异步操作.
•  Completion Handler: 处理完成事件.
•  Asynchronous Operation Processor: 执行实际 I/O.
•  Completion Dispatcher: 分发完成通知.

工作流程
•  应用程序发起异步 I/O 请求
•  操作系统接管 I/O 操作
•  I/O 操作完成后，操作系统通知应用程序
•  应用程序通过回调处理结果

Proactor vs Reactor
•  通知时机: Proactor操作完成后通知, 而Reactor是操作就绪可以开始时通知;
•  执行者: Proactor由操作系统执行, 而Reactor则应用程序实现;
•  编程复杂度: Proactor复杂度较高, Reactor复杂度较低;
•  性能: Proactor性能更高, 减少了上下文切换;
•  典型实现: 分别是Windows IOCP和Linux epoll;

Java 实现示例（模拟）

import java.nio.channels.AsynchronousServerSocketChannel;
import java.nio.channels.AsynchronousSocketChannel;
import java.nio.channels.CompletionHandler;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;

public class ProactorServer {
   
   public static void main(String[] args) throws Exception {
       AsynchronousServerSocketChannel server = 
           AsynchronousServerSocketChannel.open().bind(new InetSocketAddress(8080));
       
       // 接受连接的回调
       server.accept(null, new CompletionHandler<AsynchronousSocketChannel, Void>() {
           @Override
           public void completed(AsynchronousSocketChannel client, Void attachment) {
               // 继续接受新连接
               server.accept(null, this);
               
               // 处理客户端连接
               ByteBuffer buffer = ByteBuffer.allocate(1024);
               
               // 读取数据的回调
               client.read(buffer, buffer, new CompletionHandler<Integer, ByteBuffer>() {
                   @Override
                   public void completed(Integer bytesRead, ByteBuffer buffer) {
                       if (bytesRead > 0) {
                           buffer.flip();
                           String request = new String(buffer.array(), 0, bytesRead);
                           System.out.println("Received: " + request);
                           
                           // 准备响应
                           String response = "HTTP/1.1 200 OK\r\n\r\nHello from Proactor";
                           ByteBuffer responseBuffer = ByteBuffer.wrap(response.getBytes());
                           
                           // 写入数据的回调
                           client.write(responseBuffer, responseBuffer, 
                               new CompletionHandler<Integer, ByteBuffer>() {
                                   @Override
                                   public void completed(Integer bytesWritten, ByteBuffer buffer) {
                                       if (buffer.hasRemaining()) {
                                           client.write(buffer, buffer, this);
                                       } else {
                                           try { client.close(); } catch (Exception e) {}
                                       }
                                   }
                                   
                                   @Override
                                   public void failed(Throwable exc, ByteBuffer buffer) {
                                       exc.printStackTrace();
                                   }
                               });
                       }
                   }
                   
                   @Override
                   public void failed(Throwable exc, ByteBuffer buffer) {
                       exc.printStackTrace();
                   }
               });
           }
           
           @Override
           public void failed(Throwable exc, Void attachment) {
               exc.printStackTrace();
           }
       });
       
       // 保持主线程运行
       Thread.currentThread().join();
   }
}

关键优势
•  更高的吞吐量：减少线程阻塞和上下文切换
•  更好的资源利用：用更少的线程处理更多连接
•  天然适合长连接：高效处理持续的数据流

适用场景
•  高并发服务器（如 Web 服务器）
•  需要处理大量长连接的场景
•  对延迟敏感的应用
•  Windows 平台高性能服务（IOCP）

实现框架
•  Windows: IOCP (Input/Output Completion Port)
•  Java: NIO.2 (AsynchronousChannel)
•  Boost.Asio (C++)
•  libuv (Node.js)
Proactor 模型通过将 I/O 操作卸载到操作系统层面，实现了真正的高效异步处理，是现代高性能服务器的重要架构选择。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- BIO 同步阻塞，通常一连接一线程。
- NIO 同步非阻塞，基于 Channel、Buffer、Selector。
- AIO 异步非阻塞，由回调或 Future 获取结果。
- I/O 多路复用允许一个线程监听多个连接事件。

### 面试官想考什么
- 三种 I/O 模型差异和适用场景。
- 阻塞/非阻塞、同步/异步的区别。

### 标准回答
BIO 编程简单但高并发下线程成本高；NIO 通过 Selector 管理多个 Channel，适合高并发网络服务；AIO 将 I/O 完成通知交给系统/框架，模型更异步但使用复杂。

### 深挖追问
- select/poll/epoll 有什么区别？
- NIO 为什么需要 Buffer？
- Netty 为什么基于 NIO？

### 实战场景/代码示例
```java
Selector selector=Selector.open();
channel.configureBlocking(false);
channel.register(selector, SelectionKey.OP_READ);
```

### 易错点/总结
- 非阻塞不等于异步。
- NIO 编程复杂，实际项目常用 Netty 封装。

