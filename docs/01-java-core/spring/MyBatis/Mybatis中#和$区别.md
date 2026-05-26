# Mybatis中#和$区别

Mybatis中#和$区别
一、核心区别
#{}：预编译参数、无SQL注入风险、自动类型转换、适用于值传递；
${}：直接字符串替换，存在SQL注入风险、原样输出、适用于SQL片段或动态表名。

二、底层原理
#{}的工作机制

// MyBatis对#{}的处理流程
String sql = "SELECT * FROM user WHERE id = ?";  // 问号占位符
PreparedStatement ps = connection.prepareStatement(sql);
ps.setInt(1, 5);  // 安全参数设置
执行过程：
·  MyBatis解析SQL时会将#{}转换为？
·  创建PreparedStatement对象
·  通过setXxx()方法安全设置参数
·  数据库进行预编译执行

${}的工作原理

// MyBatis对${}的处理示例
String id = "5 OR 1=1";
String sql = "SELECT * FROM user WHERE id = " + id;  // 直接拼接
Statement stmt = connection.createStatement();
ResultSet rs = stmt.executeQuery(sql);

三、安全性深度防御方案
使用${}的安全使用规范

// 表名/列名白名单校验
public String checkColumnName(String input) {
    Set<String> validColumns = new HashSet<>(Arrays.asList("id", "name", "age"));
    if (!validColumns.contains(input)) {
        throw new IllegalArgumentException("Invalid column name");
    }
    return input;
}

混合使用的最佳实践

<!-- 安全动态SQL示例 -->
<select id="dynamicQuery" resultType="User">
    SELECT * FROM user
    WHERE 1=1
    <if test="name != null">
        AND name = #{name}
    </if>
    <if test="orderBy != null">
        ORDER BY ${@com.util.SecurityUtil@checkColumnName(orderBy)}
    </if>
</select>

四、性能影响分析
预编译#{}的优势
·  缓存执行计划：数据库可以复用预编译结果；
·  批量操作优化：相同SQL不同参数，只需要编译一次；
·  网络传输优化：二进制参数传输效率更高；

${}的性能陷阱
·  无法利用预编译缓存：每次SQL都需要重新解析；
·  增加SQL注入的检查开销：需要额外的安全校验；
·  SQL拼接消耗：字符串操作消耗CPU资源；

五、特殊场景处理技巧
LIKE查询正确写法

<!-- 安全LIKE查询 -->
<select id="searchUsers" resultType="User">
    SELECT * FROM users 
    WHERE name LIKE CONCAT('%', #{keyword}, '%')
</select>

<!-- 使用数据库特定语法 -->
<select id="searchUsers" resultType="User">
    SELECT * FROM users 
    WHERE name LIKE '%' || #{keyword} || '%'  <!-- Oracle -->
</select>

IN查询的优化方案

<!-- 安全的IN查询 -->
<select id="getUsersByIds" resultType="User">
    SELECT * FROM users 
    WHERE id IN
    <foreach collection="ids" item="id" open="(" separator="," close=")">
        #{id}
    </foreach>
</select>

六、常见误区
误区一：#{}可以防止所有的SQL注入
#{}只能用于值注入，无法用于表名/列名注入，因此只能用于防止值注入问题。
误区二：${}一定不能使用
动态表名等场景必须使用，但需要做好安全控制；
误区三：#{}会影响性能
预编译的初始化开销会被后续执行效率弥补，因此性能还是比较高的。
误区四：两者在结果上没有区别
对于字符串参数，#{}会自动识别类型，增加引号，而${}不会：

WHERE name = 'John'  -- #{name}
WHERE name = John    -- ${name}（可能报错）

七、总结
优先使用#{}的情况：
·  所有值类型的参数传递
·  用户输入的内容
·  需要类型转换的场景，自动将Java类型转换为SQL类型
·  高并发查询条件

2. 谨慎使用${}的情况：
·  动态表名/列名（需校验）
·  ORDER BY子句（需白名单）
·  确定安全的SQL片段
·  数据库特性语法（如Oracle的DUAL）
