# 数据类型-Bitmap

数据类型-Bitmap
Bitmap，即位图，是一串连续的二进制数组（0和1），可以通过偏移量（offset）定位元素。Bitmap通过最小的单位bit进行0或1的设置，表示某个元素的值或状态，时间复杂度为O(1)。

Bitmap本身是用String类型作为底层数据结构实现的一种统计二值状态的数据类型。String类型是会保存为二进制的字节数组，所以 Redis 就把字节数组的每个 bit 位利用起来，用来表示一个元素的二值状态。可以把 Bitmap 看作是一个 bit 数组。

基本命令操作：
setbit key offset value：设置值，其中value只能是0和1；
getbit key offset：获取值；
bitcount key start end：统计范围内值为1的个数，start和end是字节为单位；
bitops key value：指定key中第一次出现value的位置；
