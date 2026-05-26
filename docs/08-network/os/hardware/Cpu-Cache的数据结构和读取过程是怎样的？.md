# Cpu Cache的数据结构和读取过程是怎样的？

Cpu Cache的数据结构和读取过程是怎样的？
CPU Cache 数据结构
CPU Cache 是由很多个 Cache Line 组成的，Cache Line 是 CPU 从内存读取数据的基本单位，而 Cache Line 是由各种标志（Tag）+ 数据块（Data Block）组成。Linux 系统中 L1 Cache Line 大小一般是 64 字节，也就意味着 L1 Cache 一次载入数据的大小是 64 字节。
比如，有一个 int array[100] 的数组，当载入 array[0] 时，由于这个数组元素的大小在内存只占 4 字节，不足 64 字节，CPU 就会顺序加载数组元素到 array[15]，意味着 array[0]~array[15] 数组元素都会被缓存在 CPU Cache 中了，因此当下次访问这些数组元素时，会直接从 CPU Cache 读取，而不用再从内存中读取，大大提高了 CPU 读取数据的性能。

CPU访问数据方式
CPU 读取数据的时候，无论数据是否存放到 Cache 中，CPU 都是先访问 Cache，只有当 Cache 中找不到数据时，才会去访问内存，并把内存中的数据读入到 Cache 中，CPU 再从 CPU Cache 读取数据。CPU 访问内存数据时，是按 Cache Line 进行读取，其大小取决于 coherency_line_size 的值，一般 64 字节。在内存中，这一块的数据我们称为内存块（Block），读取的时候我们要拿到数据所在内存块的地址。那 CPU 怎么知道访问的内存数据是否在 Cache 中呢？

直接映射 Cache（Direct Mapped Cache）
直接映射 Cache 采用的策略，就是把内存块的地址始终「映射」在一个 CPU Cache Line（缓存块） 的地址，至于映射关系实现方式，则是使用「取模运算」，取模运算的结果就是内存块地址对应的 CPU Cache Line（缓存块） 的地址。取模运算会存在多个内存地址映射到同一个 CPU Cache Line 地址中，为了区别不同的内存块，在对应的 CPU Cache Line 中我们还会存储一个组标记（Tag）。这个组标记会记录当前 CPU Cache Line 中存储的数据对应的内存块，我们可以用这个组标记来区分不同的内存块。此外，CPU 在从 CPU Cache 读取数据的时候，并不是读取 CPU Cache Line 中的整个数据块，而是读取 CPU 所需要的一个数据片段，这样的数据统称为一个字（Word）。为了找到对应的 CPU Cache Line 数据块中找到所需的字，还需要一个偏移量（Offset）。因此，一个内存的访问地址，包括组标记、CPU Cache Line 索引、偏移量这三种信息，于是 CPU 就能通过这些信息，在 CPU Cache 中找到缓存的数据。
一个内存地址组成：组标记（Tag）+ 索引（Index）+ 偏移量（offset）

而对于 CPU Cache 里的数据结构，每一个 Cache Line 为了区别不同的内存块，在对应的 CPU Cache Line 中我们还会存储一个组标记（Tag）。这个组标记会记录当前 CPU Cache Line 中存储的数据对应的内存块，我们可以用这个组标记来区分不同的内存块。除了组标记信息外，CPU Cache Line 还有两个信息：从内存加载过来的实际存放数据（Data）和有效位（Valid bit），有效位是用来标记对应的 CPU Cache Line 中的数据是否是有效的，如果有效位是 0，无论 CPU Cache Line 中是否有数据，CPU 都会直接访问内存，重新加载数据。
一个 Cache Line 组成：有效位（Valid Bit）+ 组标记（Tag）+ 实际数据（Data Block）

如果内存中的数据已经在 CPU Cache 中了，那 CPU 访问一个内存地址的时候，会经历这 4 个步骤：
根据内存地址中索引信息，计算在 CPU Cache 中的索引，也就是找出对应的 CPU Cache Line 的地址；
找到对应 CPU Cache Line 后，判断 CPU Cache Line 中的有效位，确认 CPU Cache Line 中数据是否是有效的，如果是无效的，CPU 就会直接访问内存，并重新加载数据，如果数据有效，则往下执行；
对比内存地址中组标记和 CPU Cache Line 中的组标记，确认 CPU Cache Line 中的数据是我们要访问的内存数据，如果不是的话，CPU 就会直接访问内存，并重新加载数据，如果是的话，则往下执行；
根据内存地址中偏移量信息，从 CPU Cache Line 的数据块中，读取对应的字。
到这里，相信你对直接映射 Cache 有了一定认识，但其实除了直接映射 Cache 之外，还有其他通过内存地址找到 CPU Cache 中的数据的策略，比如全相连 Cache （Fully Associative Cache）、组相连 Cache （Set Associative Cache）等，这几种策策略的数据结构都比较相似，我们理解了直接映射 Cache 的工作方式，其他的策略如果你有兴趣去看，相信很快就能理解的了。
