# Java IO的装饰者模式理解

Java IO的装饰者模式理解
IO装饰者模式

以InputStream为例:
•  InputStream是抽象组件;
•  FileInputStream是InputStream的子类, 属于具体组件, 提供了字节流的输入操作;
•  FileInputStream属于抽象装饰者, 装饰者用于装饰组件, 为组件提供额外的功能. 例如BufferedInputStream为FileInputStream提供缓存功能.

实例化一个具有缓存功能的字节流对象时, 只需要在FileInputStream对象上再套一层BufferedInputStream对象即可:

FileInputStream fileInputStream = new FileInputStream(filePath);
BufferedInputStream bufferedInputStream = new BufferedInputStream(fileInputStream);

DataInputStream装饰者提供了对更多数据类型进行输入的操作, 比如int, double等基本类型.
