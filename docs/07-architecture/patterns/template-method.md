# 模板方法模式

## 核心概念

模板方法模式在父类中定义算法或业务流程骨架，把某些可变步骤延迟到子类实现。它适合“流程固定、局部步骤不同”的场景，例如导入文件、支付处理、消息消费、审批流处理。

模板方法通过继承复用流程，保证关键步骤顺序不被随意改变。它的代价是继承层次增加，子类和父类耦合较强，不适合变化维度很多的场景。

## 面试官想考什么

- 是否能说明模板方法的流程复用思想；
- 是否知道模板方法和策略模式的区别；
- 是否能结合钩子方法、抽象方法、final 方法说明；
- 是否能识别 Spring、Servlet、MyBatis 中的模板思想。

## 标准回答

> 模板方法是在抽象父类中定义固定流程，把变化步骤交给子类实现。比如文件导入统一包含校验、解析、落库、通知，CSV 和 Excel 只实现解析细节。它能复用流程并控制执行顺序，但因为依赖继承，扩展维度复杂时可能不如策略模式灵活。

## 深挖追问

### 模板方法和策略模式怎么选？

如果整体流程稳定，只是某几个步骤不同，用模板方法；如果需要运行时自由替换算法，或有多个独立变化维度，用策略模式更合适。模板方法是继承复用，策略模式是组合复用。

### 什么是钩子方法？

钩子方法是在父类提供默认实现、子类可选择覆盖的方法，例如 `afterImport()`。它让子类在不改变主流程的情况下扩展部分行为。

## 实战场景 / 代码示例

```java
public abstract class AbstractImportService<T> {
    public final void importFile(InputStream in) {
        validate(in);
        List<T> rows = parse(in);
        save(rows);
        afterImport(rows);
    }

    protected void validate(InputStream in) { /* 通用校验 */ }
    protected abstract List<T> parse(InputStream in);
    protected abstract void save(List<T> rows);
    protected void afterImport(List<T> rows) { }
}

class ExcelUserImportService extends AbstractImportService<UserRow> {
    protected List<UserRow> parse(InputStream in) { return parseExcel(in); }
    protected void save(List<UserRow> rows) { userMapper.batchInsert(rows); }
}
```

## 易错点 / 总结

- 模板方法适合固定流程，不适合频繁变化的流程；
- 父类模板方法可用 `final` 防止子类破坏顺序；
- 抽象步骤不要过多，否则子类实现成本高；
- 多维变化优先考虑组合而不是继承爆炸；
- Spring 的 `JdbcTemplate`、`RestTemplate` 都体现了模板思想。
