# MyBatis与MyBatis Plus区别是什么？

MyBatis与MyBatis Plus区别是什么？
一、概述
MyBatis-Plus（简称MP）是在MyBatis基础上增强的持久层框架，两者既有继承关系又有显著差异。
二、基础定位差异
MyBatis：基础ORM框架，原生实现，包名为org.mybatis；
MyBatis-Plus：MyBatis增强工具包，基于MyBatis的扩展，包名为com.baomidou；

三、核心功能对比
CRUD操作
MyBatis：需手动编写所有SQL，每个DAO方法需定义Mapper.xml或注解

<!-- 示例：查询用户 -->
<select id="selectById" resultType="User">
   SELECT * FROM user WHERE id = #{id}
</select>
MyBatis-Plus：内置通用Mapper，基础CRUD零SQL实现

// 无需编写SQL即可实现
userMapper.selectById(1);
userMapper.insert(user);
userMapper.updateById(user);

2. 代码生成器
MyBatis：无官方代码生成器，需借助第三方工具（如MyBatis Generator）
MyBatis-Plus：内置强大的代码生成器，可生成Entity/Mapper/Service/Controller

AutoGenerator mpg = new AutoGenerator();
mpg.setGlobalConfig(config);
mpg.setDataSource(dataSourceConfig);
mpg.execute(); // 一键生成所有层代码

三、高级特性对比
条件构造器
MyBatis：需手写WHERE条件，动态SQL使用<if>标签

<select id="selectUsers" resultType="User">
   SELECT * FROM user
   <where>
       <if test="name != null">
           AND name = #{name}
       </if>
   </where>
</select>
MyBatis-Plus：链式条件构造器，支持Lambda表达式

// 复杂查询示例
List<User> users = userMapper.selectList(
   Wrappers.<User>lambdaQuery()
       .eq(User::getName, "张三")
       .between(User::getAge, 18, 30)
       .orderByDesc(User::getCreateTime)
);

4. 分页插件
MyBatis：需自定义分页逻辑，手动计算limit参数

// 传统分页实现
int offset = (pageNum - 1) * pageSize;
List<User> users = sqlSession.selectList(
   "selectUsers", null, new RowBounds(offset, pageSize));
MyBatis-Plus：内置物理分页插件，支持多种数据库方言

// 分页查询示例
Page<User> page = new Page<>(1, 10);
page = userMapper.selectPage(page, queryWrapper);
List<User> records = page.getRecords();

四、扩展功能对比
乐观锁支持
MyBatis：需手动实现版本控制

UPDATE product SET stock = stock - 1, version = version + 1 
WHERE id = 1 AND version = #{oldVersion}
MyBatis-Plus：@Version注解自动实现

@Version
private Integer version; // 自动乐观锁控制

逻辑删除
MyBatis：需自行添加删除标记字段，手动修改所有查询条件
MyBatis-Plus：@TableLogic注解自动过滤

@TableLogic
private Integer deleted; // 0-未删 1-已删
// 自动拼接 WHERE deleted=0

五、性能优化
SQL注入器
MyBatis：扩展需修改底层代码
MyBatis-Plus：支持自定义全局SQL方法

public class MySqlInjector extends DefaultSqlInjector {
   @Override
   public List<AbstractMethod> getMethodList() {
       List<AbstractMethod> methods = super.getMethodList();
       methods.add(new BatchInsertMethod()); // 添加批量插入方法
       return methods;
   }
}

六、总结建议
选择MyBatis：需要精细控制每个SQL、项目已基于MyBatis深度定制、团队熟悉原生MyBatis；
选择MyBatis-Plus：新项目快速开发、单表操作占比高、希望减少重复CRUD代码、需要国内团队支持；
混合使用方案：

// 复杂SQL仍用原生方式
@Select("SELECT * FROM user WHERE ...")
List<User> selectComplexUsers();
// 简单CRUD用MP
userService.saveBatch(userList);
最终决策应基于项目需求、团队技术栈和长期维护成本综合考虑。MyBatis-Plus在保持MyBatis灵活性的同时，显著提升了开发效率，是现代Java项目推荐的持久层选择。
