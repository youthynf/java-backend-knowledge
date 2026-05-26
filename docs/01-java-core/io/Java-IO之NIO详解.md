# Java IO之NIO详解

Java IO之NIO详解
概述
NIO (New I/O 或 Non-blocking I/O) 是 Java 1.4 引入的一组新的 I/O API，提供了与传统 I/O 不同的工作方式，弥补了传统的 I/O 的不足，提供了高速的、面向块的 I/O。
Standard IO是对字节流的读写，在进行IO之前，首先创建一个流对象，流对象进行读写操作都是按字节 ，一个字节一个字节的来读或写。而NIO把IO抽象成块，类似磁盘的读写，每次IO操作的单位都是一个块，块被读入内存之后就是一个byte[]，NIO一次可以读或写多个字节。
流与块
I/O与NIO最重要的区别是数据打包和传输的方式，I/O以流的方式处理数据，而NIO以块的方式处理数据。
•  面向流的I/O一次处理一个字节数据，一个输入流产生一个字节数据，一个输出流消费一个字节数据。为流式数据创建过滤器非常容易，链接几个过滤器，以便每个过滤器只负责复杂处理机制的一部分。不利的一面是，面向流的I/O通常相当慢。
•  面向块的I/O 一次处理一个数据块，按块处理数据比按流处理数据要快得多。但是面向块的 I/O缺少一些面向流的I/O所具有的优雅性和简单性。
I/O包和NIO已经很好地集成了，java.io.*已经以NIO为基础重新实现了，所以现在它可以利用 NIO 的一些特性。例如，java.io.* 包中的一些类包含以块的形式读写数据的方法，这使得即使在面向流的系统中，处理速度也会更快。
通道与缓冲区
通道 
通道是应用程序与操作系统交互时间和传递内容的渠道, 一个通道会有一个专属的文件描述符. 可以通过它读取和写入数据. 通道与流的不同之处在于, 流只能在一个方向上移动(一个流必须是InputStream或者OutputStream的子类), 而通道是双向的, 可以用于读、写或者同时用于读写。所有被Selector(选择器)注册的通道, 只能是继承了SelectableChannel类的子类. 通道包括以下类型:
•  FileChannel: 从文件中读写数据；
•  DatagramChannel: 通过UDP读写网络中数据, 是UDP数据报文的监听通道；
•  SocketChannel: 通过TCP读写网络中数据, 是TCP Socket套接字的监听通道；
•  ServerSocketChannel: 应用服务器程序的监听通道. 只有通过这个通道, 应用程序才能向操作系统注册支持IO多路复用端口的监听. 同时支持UDP和TCP协议, 并对每一个新进来的连接都会创建一个 SocketChannel。

缓冲区
在Java NIO框架中, 为了保证每个通道的数据读写速度, Java NIO框架为每一个需要支持数据读取的通道都集成了Buffer的支持. 发送给一个通道的所有数据都必须首先放到缓冲区中，同样地，从通道中读取的任何数据都要先读到缓冲区中。也就是说，不会直接对通道进行读写数据，而是要先经过缓冲区。缓冲区实质上是一个数组，但它不仅仅是一个数组。缓冲区提供了对数据的结构化访问，而且还可以跟踪系统的读/写进程。缓冲区包括以下类型:
•  ByteBuffer
•  CharBuffer
•  ShortBuffer
•  IntBuffer
•  LongBuffer
•  FloatBuffer
•  DoubleBuffer

缓冲区状态变量
•  capacity: 缓冲区的最大容量, 这个容量是在缓冲区创建时进行指定的；
•  position: 缓冲区目前在操作的数据块位置；
•  limit: 缓冲区最大可以进行操作的位置, 缓冲区的读写状态正是由这个属性控制的.
文件NIO示例

public static void fastCopy(String src, String dist) throws IOException {

    /* 获得源文件的输入字节流 */
    FileInputStream fin = new FileInputStream(src);

    /* 获取输入字节流的文件通道 */
    FileChannel fcin = fin.getChannel();

    /* 获取目标文件的输出字节流 */
    FileOutputStream fout = new FileOutputStream(dist);

    /* 获取输出字节流的通道 */
    FileChannel fcout = fout.getChannel();

    /* 为缓冲区分配 1024 个字节 */
    ByteBuffer buffer = ByteBuffer.allocateDirect(1024);

    while (true) {

        /* 从输入通道中读取数据到缓冲区中 */
        int r = fcin.read(buffer);

        /* read() 返回 -1 表示 EOF */
        if (r == -1) {
            break;
        }

        /* 切换读写 */
        buffer.flip();

        /* 把缓冲区的内容写入输出文件中 */
        fcout.write(buffer);
        
        /* 清空缓冲区 */
        buffer.clear();
    }
}

选择器
Selector的英文含义是选择器, 其实根据其岗位职责, 可以把它称为"轮询代理器"/"事件订阅器"/"channel容器管理机". 
•  事件订阅和Channel管理
应用程序将向Selector注册需要它关注的Channel, 以及具体某一个Channel会对哪那些IO事件感兴趣. Selector中也会维护一个自己已经注册的Channel的容器.
•  轮询代理
应用不再通过阻塞模式或者非阻塞模式直接询问操作系统事件是否发生, 而是由Selector代其询问. 当通道（channel）上的IO事件还没有到达时，就不会进入阻塞一直等待，而是继续轮询其他通道（channel），从而找到IO事件已经到达的通道（channel）执行。
•  实现不同操作系统的支持
多路复用IO技术是需要操作系统进行支持的, 其特点就是操作系统可以同时扫描同一个端口上不同网络连接的事件. 所以作为上层的JVM, 必须要为不同操作系统的多路复用IO实现编写不同的代码. 同样我使用的测试环境是Windows, 它对应的实现类是sun.nio.ch.WindowsSelectorImpl.
特别注意：只用套接字的Channel才能配置非阻塞，而FileChannel不能，为FileChannel配置非阻塞也没有意义。

使用示例：

// 服务端
public class NIOServer {

    public static void main(String[] args) throws IOException {

        Selector selector = Selector.open();

        ServerSocketChannel ssChannel = ServerSocketChannel.open();
        ssChannel.configureBlocking(false);
        ssChannel.register(selector, SelectionKey.OP_ACCEPT);

        ServerSocket serverSocket = ssChannel.socket();
        InetSocketAddress address = new InetSocketAddress("127.0.0.1", 8888);
        serverSocket.bind(address);

        while (true) {

            selector.select();
            Set<SelectionKey> keys = selector.selectedKeys();
            Iterator<SelectionKey> keyIterator = keys.iterator();

            while (keyIterator.hasNext()) {

                SelectionKey key = keyIterator.next();

                if (key.isAcceptable()) {

                    ServerSocketChannel ssChannel1 = (ServerSocketChannel) key.channel();

                    // 服务器会为每个新连接创建一个 SocketChannel
                    SocketChannel sChannel = ssChannel1.accept();
                    sChannel.configureBlocking(false);

                    // 这个新连接主要用于从客户端读取数据
                    sChannel.register(selector, SelectionKey.OP_READ);

                } else if (key.isReadable()) {

                    SocketChannel sChannel = (SocketChannel) key.channel();
                    System.out.println(readDataFromSocketChannel(sChannel));
                    sChannel.close();
                }

                keyIterator.remove();
            }
        }
    }

    private static String readDataFromSocketChannel(SocketChannel sChannel) throws IOException {

        ByteBuffer buffer = ByteBuffer.allocate(1024);
        StringBuilder data = new StringBuilder();

        while (true) {

            buffer.clear();
            int n = sChannel.read(buffer);
            if (n == -1) {
                break;
            }
            buffer.flip();
            int limit = buffer.limit();
            char[] dst = new char[limit];
            for (int i = 0; i < limit; i++) {
                dst[i] = (char) buffer.get(i);
            }
            data.append(dst);
            buffer.clear();
        }
        return data.toString();
    }
}

// 客户端
public class NIOClient {

    public static void main(String[] args) throws IOException {
        Socket socket = new Socket("127.0.0.1", 8888);
        OutputStream out = socket.getOutputStream();
        String s = "hello world";
        out.write(s.getBytes());
        out.close();
    }
}

内存映射文件
内存映射文件I/O是一种读和写文件数据的方法，它可以比常规的基于流或者基于通道的I/O快得多。但是向内存映射文件写入也是危险的，只是改变数组的单个元素这样的简单操作，就可能会直接修改磁盘上的文件，修改数据和将数据保存到磁盘是没有分开的。
示例：
将文件的前1024个字节映射到内存中，map()方法返回一个MappedByteBuffer，它是ByteBuffer的子类，因此可以向使用其他ByteBuffer一样使用新映射的缓冲区，操作系统会在需要时负责执行映射。

MappedByteBuffer mbb = fc.map(FileChannel.MapMode.READ_WRITE, 0, 1024);

总结：
NIO与普通I/O区别：
•  NIO是非阻塞的
•  NIO面向块，I/O面向流
