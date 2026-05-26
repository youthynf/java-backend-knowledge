# BigDecimal基本原理

BigDecimal基本原理
基本原理
BigDecimal 在计算时，实际会把数值扩大10(n)倍，变成一个long型整数进行计算，整数计算时自然可以实现精度不丢失。同时结合精度函数setScale(位数,模式)，实现最终结果的计算。

注意事项：
通过构造方法创建时，入参需要是字符串类型，否则会丢失精度，或者使用BigDecimal.valueOf()初始化，因为部分float和double无法使用二进制精确表示；
equals()不仅比较值大小，还比较精度，精度不同时使用compareTo()替代；
如果除法结果是一个无限小数，不设置精度会导致抛异常；
使用toString()转字符串会出现科学计数法，可以使用toPlainString()原样打印所有有效数字，或者toEngineringString()工程计数法表示。
