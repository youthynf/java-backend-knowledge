# Java IO之Netty框架概要

Java IO之Netty框架概要
概述
Netty是一个高性能、异步事件驱动的NIO框架，提供了对TCP、UDP和文件传输的支持。作为当前最流行的NIO框架，Netty在互联网领域、大数据分布式计算领域、游戏行业、通信行业等获得了广泛的应用，一些业界著名的开源组件也基于Netty构建，比如RPC框架、zookeeper等。
NIO框架
目前流行的NIO框架非常多，最常用的有一下几种：
•  原生Java NIO框架：Java NIO通信框架基于多路复用IO原理；
•  APACHE MINA 2：网络框架，提供通过Java NIO在不同传输（TCP/IP和UPD/IP）上抽象得到事件驱动的异步API；
•  NETTY 4/5：由JBOSS提供的一个Java开源框架，提供异步的、事件驱动的网络应用程序框架和工具；
•  Grizzly：应用程序框架，专门解决编写成千上万用户访问服务器时产生的各种问题，使用Java NIO作为基础，隐藏起变成复杂性。

Netty的优点
API简单，开发门槛低；
功能强大，内置了多种编码、解码能力；
与其他业界主流的NIO框架对比，Netty的综合性能最优；
社区活跃，使用广泛，经理过很多商业应用项目的考验；
定制能力强，可以对框架进行灵活的扩展。
Netty使用示例
•  引入依赖

<dependency>
     <groupId>org.jboss.netty</groupId>
     <artifactId>netty</artifactId>
     <version>3.2.5.Final</version>
</dependency>

•  服务端：接收客户端请求并将内容打印出来，同时发送一个消息收到回执。

public class NettyServer {

    private static int HEADER_LENGTH = 4;

    public void bind(int port) throws Exception {

        ServerBootstrap b = new ServerBootstrap(new NioServerSocketChannelFactory(Executors.newCachedThreadPool(),
                                                                                  Executors.newCachedThreadPool()));

        // 构造对应的pipeline
        b.setPipelineFactory(new ChannelPipelineFactory() {

            public ChannelPipeline getPipeline() throws Exception {
                ChannelPipeline pipelines = Channels.pipeline();
                pipelines.addLast(MessageHandler.class.getName(), new MessageHandler());
                return pipelines;
            }
        });
        // 监听端口号
        b.bind(new InetSocketAddress(port));
    }

    // 处理消息
    static class MessageHandler extends SimpleChannelHandler {

        public void messageReceived(ChannelHandlerContext ctx, MessageEvent e) throws Exception {
            // 接收客户端请求
            ChannelBuffer buffer = (ChannelBuffer) e.getMessage();
            String message = new String(buffer.readBytes(buffer.readableBytes()).array(), "UTF-8");
            System.out.println("<服务端>收到内容=" + message);

            // 给客户端发送回执
            byte[] body = "服务端已收到".getBytes();
            byte[] header = ByteBuffer.allocate(HEADER_LENGTH).order(ByteOrder.BIG_ENDIAN).putInt(body.length).array();
            Channels.write(ctx.getChannel(), ChannelBuffers.wrappedBuffer(header, body));
            System.out.println("<服务端>发送回执,time=" + System.currentTimeMillis());

        }
    }

    public static void main(String[] args) {
        try {
            new NettyServer().bind(1088);
        } catch (Exception e) {
            e.printStackTrace();
        }
        ;
    }
}

•  客户端：向服务端发送一个请求，然后打印服务端响应的内容。

public class NettyClient {

    private final ByteBuffer readHeader  = ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN);
    private final ByteBuffer writeHeader = ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN);
    private SocketChannel    channel;

    public void sendMessage(byte[] body) throws Exception {
        // 创建客户端通道
        channel = SocketChannel.open();
        channel.socket().setSoTimeout(60000);
        channel.connect(new InetSocketAddress(AddressUtils.getHostIp(), 1088));

        // 客户端发请求
        writeWithHeader(channel, body);

        // 接收服务端响应的信息
        readHeader.clear();
        read(channel, readHeader);
        int bodyLen = readHeader.getInt(0);
        ByteBuffer bodyBuf = ByteBuffer.allocate(bodyLen).order(ByteOrder.BIG_ENDIAN);
        read(channel, bodyBuf);
        System.out.println("<客户端>收到响应内容: " + new String(bodyBuf.array(), "UTF-8") + ",长度:" + bodyLen);
    }

    private void writeWithHeader(SocketChannel channel, byte[] body) throws IOException {
        writeHeader.clear();
        writeHeader.putInt(body.length);
        writeHeader.flip();
        // channel.write(writeHeader);
        channel.write(ByteBuffer.wrap(body));
    }

    private void read(SocketChannel channel, ByteBuffer buffer) throws IOException {
        while (buffer.hasRemaining()) {
            int r = channel.read(buffer);
            if (r == -1) {
                throw new IOException("end of stream when reading header");
            }
        }
    }

    public static void main(String[] args) {
        String body = "客户发的测试请求！";
        try {
            new NettyClient().sendMessage(body.getBytes());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

---
## 核心概念
Java IO之Netty框架概要 可以放在“工程实践能力”这条主线里理解。复习时不要只背结论，要先说明它解决的核心问题，再解释关键机制、适用边界和代价。围绕这个知识点，重点关注：定义、原理、边界、取舍、常见问题、排查方法和落地成本。如果面试官继续追问，通常会从“为什么这样设计、在什么场景会失效、线上如何排查”三个方向展开。

## 面试回答与追问
- **标准回答**：先给出 Java IO之Netty框架概要 的定位，再说明它依赖的核心原理，最后结合业务场景说明如何使用。回答时要把“能解决什么问题”和“会带来什么成本”一起讲清楚。
- **常见追问**：如果数据量、并发量或调用链路继续放大，Java IO之Netty框架概要 的瓶颈会出现在哪里？如何观测、如何优化、如何回滚？
- **易错点**：不要把概念和具体实现混在一起，也不要只说 API 名称。面试中更重要的是说清楚边界条件、失败场景和取舍依据。

## 实战场景与排查
典型落地场景包括：真实业务开发、线上问题治理、性能优化、协作交付和面试复盘。实际处理线上问题时，可以按“现象确认 → 指标采集 → 假设验证 → 小步修复 → 复盘沉淀”的路径推进。先看日志、监控、链路追踪和核心指标，再判断是容量问题、配置问题、代码路径问题，还是外部依赖抖动。

## 总结
复习 Java IO之Netty框架概要 时，建议把它和相邻知识点放在一起比较：相同点是什么、区别在哪里、为什么当前场景选择它而不是替代方案。能讲清楚这些内容，才算真正掌握。
