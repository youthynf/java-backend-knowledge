# Java IO如何实现零拷贝？

Java IO如何实现零拷贝？
前言
开始本文之前，可以先学习【操作系统/IO分类/Linux零拷贝详解】，便于下文的理解。
Java NIO零拷贝
在 Java NIO 中的通道（Channel）就相当于操作系统的内核空间（kernel space）的缓冲区，而缓冲区（Buffer）对应的相当于操作系统的用户空间（user space）中的用户缓冲区（user buffer）。
•  通道（Channel）是全双工的（双向传输），它既可能是读缓冲区（read buffer），也可能是网络缓冲区（socket buffer）。
•  缓冲区（Buffer）分为堆内存（HeapBuffer）和堆外内存（DirectBuffer），这是通过malloc()分配出来的用户态内存。

堆外内存（DirectBuffer）在使用后需要应用程序手动回收，而堆内存（HeapBuffer）的数据在 GC 时可能会被自动回收。因此，在使用HeapBuffer读写数据时，为了避免缓冲区数据因为GC而丢失，NIO 会先把HeapBuffer内部的数据拷贝到一个临时的DirectBuffer中的本地内存（native memory），这个拷贝涉及到sun.misc.Unsafe.copyMemory()的调用，背后的实现原理与memcpy()类似。 最后，将临时生成的DirectBuffer内部的数据的内存地址传给 I/O调用函数，这样就避免了再去访问Java对象处理I/O读写。

MappedByteBuffer
MappedByteBuffer是Java中通过FileChannel.map()方法将文件直接映射到虚拟内存的缓冲区，它属于用户空间的内存缓冲区，但它的特殊之处在于它是由操作系统通过内存映射文件（Memory-mapped File）机制实现的。通过内存映射文件（MappedByteBuffer）写入用户空间的缓冲区数据，本质上等于直接修改内核页缓存（Page Cache）。MappedByteBuffer继承自ByteBuffer。FileChannel定义了一个map()方法，它可以把一个文件从position位置开始的size大小的区域映射为内存映像文件。抽象方法map()方法在FileChannel中的定义如下：

public abstract MappedByteBuffer map(MapMode mode, long position, long size)
        throws IOException;
•  mode：限定内存映射区域（MappedByteBuffer）对内存映像文件的访问模式，包括只读（READ_ONLY）、可读可写（READ_WRITE)、写时复制（PRIVATE）三种模式；
•  position：文件映射的起始地址，对应内存映射区域（MappedByteBuffer）的首地址；
•  size：文件映射的字节长度，从position往后的字节数，对应内存映射区域（MappedByteBuffer）的大小。

MappedByteBuffer相比ByteBuffer新增了fore()、load()、isLoad()三个重要的方法：
•  fore()：对于处于READ_WRITE模式下的缓冲区，把对缓冲区内容的修改强制刷新到本地文件；
•  load()：将缓冲区的内容载入物理内存中，并返回这个缓冲区的引用；
•  isLoaded()：如果缓冲区的内容在物理内存中，则返回true，否则返回false；

关键点解析：
用户空间vs内核空间
•  用户空间内存缓冲区：一般指由JVM分配的堆内存或直接内存（如ByteBuffer.allocateDirect()）,完全由用户程序管理。
•  MappedByteBuffer：虽然它在用户空间暴露为一个普通的ByteBuffer，但其底层是通过操作系统的内存映射机制实现的，文件内容按需从磁盘加载到内核的也缓存中（Page Cache），再映射到用户空间的虚拟内存地址，因此它跨越了用户空间和内核空间。

写入流程
•  当你写入MappedByteBuffer时，数据会先修改用户空间的映射内存；
•  操作系统会在后台通过也缓存机制将更改同步到磁盘（除非手动调用force()）;
•  force()方法会强制将内核页缓存中的脏页写入磁盘，确保数据持久化；

与普通缓冲区的区别
•  普通的HeapByteBuffer（如ByteBuffer.allocate()）仅存在于JVM堆内存，不与文件直接关联；
•  MappedByteBuffer直接关联文件，避免显式的read()/write()系统调用，性能更高，尤其适合大文件随机访问；

使用示例：

private final static String CONTENT = "Zero copy implemented by MappedByteBuffer";
private final static String FILE_NAME = "/mmap.txt";
private final static String CHARSET = "UTF-8";

// 写文件
@Test
public void writeToFileByMappedByteBuffer() {
    Path path = Paths.get(getClass().getResource(FILE_NAME).getPath());
    byte[] bytes = CONTENT.getBytes(Charset.forName(CHARSET));
    // 打开文件通道 fileChannel 并提供读权限、写权限和数据清空权限
    try (FileChannel fileChannel = FileChannel.open(path, StandardOpenOption.READ,
            StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
        // 通过 fileChannel 映射到一个可写的内存缓冲区 mappedByteBuffer
        MappedByteBuffer mappedByteBuffer = fileChannel.map(READ_WRITE, 0, bytes.length);
        if (mappedByteBuffer != null) {
            // 将目标数据写入 mappedByteBuffer
            mappedByteBuffer.put(bytes);
            // 通过 force() 方法把缓冲区更改的内容强制写入本地文件
            mappedByteBuffer.force();
        }
    } catch (IOException e) {
        e.printStackTrace();
    }
}

// 读文件数据
@Test
public void readFromFileByMappedByteBuffer() {
    Path path = Paths.get(getClass().getResource(FILE_NAME).getPath());
    int length = CONTENT.getBytes(Charset.forName(CHARSET)).length;
    // 打开文件通道 fileChannel 并提供只读权限
    try (FileChannel fileChannel = FileChannel.open(path, StandardOpenOption.READ)) {
        // 通过 fileChannel 映射到一个只可读的内存缓冲区 mappedByteBuffer
        MappedByteBuffer mappedByteBuffer = fileChannel.map(READ_ONLY, 0, length);
        if (mappedByteBuffer != null) {
            // 读取 mappedByteBuffer 中的字节数组即可得到文件数据
            byte[] bytes = new byte[length];
            mappedByteBuffer.get(bytes);
            String content = new String(bytes, StandardCharsets.UTF_8);
            assertEquals(content, "Zero copy implemented by MappedByteBuffer");
        }
    } catch (IOException e) {
        e.printStackTrace();
    }
}

MappedByteBuffer特点及不足：
•  MappedByteBuffer使用是堆外的虚拟内存，因此分配（map）的内存大小不受JVM的-Xmx参数限制，但是也是有大小限制的。 如果当文件超出Integer.MAX_VALUE字节限制时，可以通过 position 参数重新 map 文件后面的内容。
•  MappedByteBuffer在处理大文件时性能的确很高，但也存内存占用、文件关闭不确定等问题，被其打开的文件只有在垃圾回收的才会被关闭，而且这个时间点是不确定的。
•  MappedByteBuffer提供了文件映射内存的 mmap() 方法，也提供了释放映射内存的 unmap() 方法。然而 unmap() 是 FileChannelImpl 中的私有方法，无法直接显示调用。因此，用户程序需要通过 Java 反射的调用 sun.misc.Cleaner 类的 clean() 方法手动释放映射占用的内存区域。

DirectByteBuffer
DirectByteBuffer的对象引用位于Java内存模型的堆里面，JVM可以对DirectByteBuffer的对象进行内存分配和回收管理，一般使用DirectByteBuffer的静态方法allocateDirect()创建DirectByteBuffer实例并分配内存。

public static ByteBuffer allocateDirect(int capacity) {
    return new DirectByteBuffer(capacity);
}

DirectByteBuffer内部的字节缓冲区位在于堆外的（用户态）直接内存，它是通过Unsafe的本地方法allocateMemory() 进行内存分配，底层调用的是操作系统的malloc() 函数。

DirectByteBuffer(int cap) {
    super(-1, 0, cap, cap);
    boolean pa = VM.isDirectMemoryPageAligned();
    int ps = Bits.pageSize();
    long size = Math.max(1L, (long)cap + (pa ? ps : 0));
    Bits.reserveMemory(size, cap);

    long base = 0;
    try {
        base = unsafe.allocateMemory(size);
    } catch (OutOfMemoryError x) {
        Bits.unreserveMemory(size, cap);
        throw x;
    }
    unsafe.setMemory(base, size, (byte) 0);
    if (pa && (base % ps != 0)) {
        address = base + ps - (base & (ps - 1));
    } else {
        address = base;
    }
    cleaner = Cleaner.create(this, new Deallocator(base, size, cap));
    att = null;
}

除此之外，初始化DirectByteBuffer时还会创建一个Deallocator线程，并通过Cleaner的freeMemory()方法来对直接内存进行回收操作，freeMemory()底层调用的是操作系统的free()函数。

private static class Deallocator implements Runnable {
    private static Unsafe unsafe = Unsafe.getUnsafe();

    private long address;
    private long size;
    private int capacity;

    private Deallocator(long address, long size, int capacity) {
        assert (address != 0);
        this.address = address;
        this.size = size;
        this.capacity = capacity;
    }

    public void run() {
        if (address == 0) {
            return;
        }
        unsafe.freeMemory(address);
        address = 0;
        Bits.unreserveMemory(size, capacity);
    }
}

由于使用 DirectByteBuffer 分配的是系统本地的内存，不在 JVM 的管控范围之内，因此直接内存的回收和堆内存的回收不同，直接内存如果使用不当，很容易造成 OutOfMemoryError。

与MappedByteBuffer不同，DirectByteBuffer通过ByteBuffer.allocateDirect()分配在堆外内存（JVM直接内存），属于用户空间的内存缓冲区，它不直接关联文件，仅是一块普通的内存区域（通常用于减少JVM堆与Native内存间的拷贝）。
与MappedByteBuffer的关联：
DirectByteBuffer是MppedByteBuffer的具体实现类
在Java中，DirectByteBuffer继承自MappedByteBuffer，DirectByteBuffer是MappedByteBuffer的具体实现类，实际上，MappedByteBuffer的map()方法最终底层通过反射机制获取DirectByteBuffer的构造器，然后创建一个DirectByteBuffer实例，对应的是一个单独用于内存映射的构造方法：

protected DirectByteBuffer(int cap, long addr, FileDescriptor fd, Runnable unmapper) {
    super(-1, 0, cap, cap, fd);
    address = addr;
    cleaner = Cleaner.create(this, unmapper);
    att = null;
}

因此，除了允许分配操作系统的直接内存以外，DirectByteBuffer 本身也具有文件内存映射的功能，DirectByteBuffer 在 MappedByteBuffer 的基础上提供了内存映像文件的随机读取 get() 和写入 write() 的操作。

内存映像文件的随机读写都是借助 ix() 方法实现定位的， ix() 方法通过内存映射空间的内存首地址（address）和给定偏移量 i 计算出指针地址，然后由 unsafe 类的 get() 和 put() 方法和对指针指向的数据进行读取或写入。

底层均依赖Native内存
两者都不在JVM对上分配，而是通过Unsafe或系统调用直接操作Native内存；
因此都需要注意内存泄漏（需显示释放或依赖GC的Cleaner机制）；
性能优化方向不同
MappedByteBuffer：利用操作系统的内核页缓存机制，避免用户态与内核态的数据拷贝；
DirectByteBuffer：减少JVM与Native内存间的数据拷贝（如网络Socket传输）；

FileChannel
FileChannel是一个用于文件读写、映射和操作的通道，同时它在并发环境下是线程安全的，基于FileInputStream、FileOutputStream或者RandomAccessFile的getChannel()方法可以创建并打开一个文件通道。FileChannel定义了transferFrom()和transferTo()两个抽象方法，它通过在通道和通道之间建立连接实现数据传输的。
•  transferTo()：通过 FileChannel 把文件里面的源数据写入一个 WritableByteChannel 的目的通道。

public abstract long transferTo(long position, long count, WritableByteChannel target)
       throws IOException;
•  transferFrom()：把一个源通道 ReadableByteChannel 中的数据读取到当前 FileChannel 的文件里面。

public abstract long transferFrom(ReadableByteChannel src, long position, long count)
       throws IOException;

使用示例：

private static final String CONTENT = "Zero copy implemented by FileChannel";
private static final String SOURCE_FILE = "/source.txt";
private static final String TARGET_FILE = "/target.txt";
private static final String CHARSET = "UTF-8";

@Before
public void setup() {
    Path source = Paths.get(getClassPath(SOURCE_FILE));
    byte[] bytes = CONTENT.getBytes(Charset.forName(CHARSET));
    try (FileChannel fromChannel = FileChannel.open(source, StandardOpenOption.READ,
            StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
        fromChannel.write(ByteBuffer.wrap(bytes));
    } catch (IOException e) {
        e.printStackTrace();
    }
}

// 通过 transferTo() 将 fromChannel 中的数据拷贝到 toChannel
@Test
public void transferTo() throws Exception {
    try (FileChannel fromChannel = new RandomAccessFile(
             getClassPath(SOURCE_FILE), "rw").getChannel();
         FileChannel toChannel = new RandomAccessFile(
             getClassPath(TARGET_FILE), "rw").getChannel()) {
        long position = 0L;
        long offset = fromChannel.size();
        fromChannel.transferTo(position, offset, toChannel);
    }
}

// 通过 transferFrom() 将 fromChannel 中的数据拷贝到 toChannel
@Test
public void transferFrom() throws Exception {
    try (FileChannel fromChannel = new RandomAccessFile(
             getClassPath(SOURCE_FILE), "rw").getChannel();
         FileChannel toChannel = new RandomAccessFile(
             getClassPath(TARGET_FILE), "rw").getChannel()) {
        long position = 0L;
        long offset = fromChannel.size();
        toChannel.transferFrom(fromChannel, position, offset);
    }
}

transferTo() 和 transferFrom() 底层都是基于 sendfile 实现数据传输的，其中 FileChannelImpl.java 定义了 3 个常量，用于标示当前操作系统的内核是否支持 sendfile 以及 sendfile 的相关特性。
•  transferSupported：用于标记当前的系统内核是否支持 sendfile() 调用，默认为 true。
•  pipeSupported：用于标记当前的系统内核是否支持文件描述符（fd）基于管道（pipe）的 sendfile() 调用，默认为 true。
•  fileSupported：用于标记当前的系统内核是否支持文件描述符（fd）基于文件（file）的 sendfile() 调用，默认为 true。

以transferTo()的源码实现为例：
•  FileChannelImpl首先执行transferToDirectly()方法，以sendfile的零拷贝方式尝试数据拷贝。
•  如果系统内核不支持 sendfile，进一步执行transferToTrustedChannel()方法，以mmap的零拷贝方式进行内存映射，这种情况下目的通道必须是FileChannelImpl或者SelChImpl类型。
•  如果以上两步都失败了，则执行transferToArbitraryChannel()方法，基于传统的I/O方式完成读写，具体步骤是初始化一个临时的 DirectBuffer，将源通道 FileChannel 的数据读取到 DirectBuffer，再写入目的通道 WritableByteChannel 里面。

Netty零拷贝实现原理
Netty 零拷贝完全是基于（Java 层面）用户态的，它的更多的是偏向于数据操作优化这样的概念，具体表现在以下几个方面：
文件传输优化：FileRegion
Netty提供了FileRegion，底层使用FileChannel.transferTo()（Linux对应sendfile系统调用），实现文件数据直接从内核缓冲区 → 网卡缓冲区，无需经过用户空间，避免用户态拷贝。

File file = new File("large_file.txt");
FileInputStream fis = new FileInputStream(file);
FileChannel fileChannel = fis.getChannel();

// 使用 FileRegion 实现零拷贝
ChannelFuture future = channel.writeAndFlush(new DefaultFileRegion(
    fileChannel, 0, file.length()
));
优势：文件数据不经过用户空间，减少CPU和内存占用，适用于大文件传输（如视频、日志文件）。

内存优化：CompositeByteBuf
Netty的CompositeByteBuf可以逻辑合并多个ByteBuf，避免数据拷贝：

ByteBuf header = Unpooled.buffer();
ByteBuf body = Unpooled.directBuffer();

// 组合 header 和 body，不实际拷贝数据
CompositeByteBuf compositeBuf = Unpooled.compositeBuffer();
compositeBuf.addComponents(true, header, body);
优势：减少数据合并时的拷贝（如HTTP协议header+body组合），适用于协议分包、粘包处理。

堆外内存：DirectByteBuf
Netty默认使用堆外内存（DirectByteBuf）存储数据，避免JVM 堆 ↔ 堆外内存的拷贝：

// 默认使用 DirectByteBuf
ByteBuf directBuf = Unpooled.directBuffer(1024);
directBuf.writeBytes("Netty Zero-Copy".getBytes());
优势：Socket读写时，数据无需从JVM堆拷贝到堆外内存（DirectByteBuf直接用于网络传输），减少GC压力，提高吞吐量。

ByteBuf.slice()与ByteBuf.duplicate()
Netty提供切片（Slice()）和复制视图（duplicate()），共享内存，避免数据拷贝：

ByteBuf buffer = Unpooled.buffer(16);
buffer.writeBytes("Hello, Netty!".getBytes());

// 切片（共享底层数据，不拷贝）
ByteBuf slice = buffer.slice(0, 5); // "Hello"

// 复制视图（共享底层数据，读写独立）
ByteBuf duplicate = buffer.duplicate();
优势：适用于协议解析（如只读取header部分），多个逻辑ByteBuf共享同一块物理内存。

与传统I/O的对比
•  文件传输：传统I/O是FileInputStream→用户缓冲区→内核Socket缓冲区→网卡，Netty则通过FileRegion直接内核→网卡，减少了用户空间的拷贝过程；
•  内存合并：传统I/O通过System.arraycopy()拷贝数据，Netty则通过CompositeByteBuf进行逻辑合并，避免数据拷贝；
•  网络传输：传统I/O通过堆内存→堆外内存→网卡，Netty通过DirectByteBuf直接操作堆外内存，避免JVM堆↔堆外数据复制；
•  数据切片：传统I/O通过创建新数组并拷贝，Netty通过ByteBuf.slice()共享内存方式减少拷贝；

RocketMQ与Kafka对比
RocketMQ选择了mmap+write这种零拷贝方式，适用于业务级消息这种小块文件的数据持久化和传输；而Kafka采用的是sendfile这种零拷贝方式，适用于系统日志消息这种高吞吐量的大块文件的数据持久化和传输。但是值得注意的一点是，Kafka的索引文件使用的是mmap+write方式，数据文件使用的是 sendfile方式。
