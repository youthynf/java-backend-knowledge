# Java遍历集合的方法有哪些？

Java遍历集合的方法有哪些？
传统的for循环（适用于数组）:

int[] array = {1, 2, 3, 4, 5};
for (int i = 0; i < array.length; i++) {
   System.out.println(array[i]);
}

for-each循环（适用于数组和集合）:

int[] array = {1, 2, 3, 4, 5};
for (int value : array) {
   System.out.println(value);
}

// 对于集合
List<String> list = Arrays.asList("Java", "Python", "C++");
for (String language : list) {
   System.out.println(language);
}

使用Iterator迭代器（适用于集合）:

List<Integer> list = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
Iterator<Integer> iterator = list.iterator();
while (iterator.hasNext()) {
   System.out.println(iterator.next());
}

4.使用增强型for循环（适用于集合）

List<Integer> list = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
for (Integer number : list) {
   System.out.println(number);
}

5.使用Java 8的Stream API（适用于集合）

List<String> languages = Arrays.asList("Java", "Python", "C++");
languages.stream().forEach(System.out::println);

6.使用Java 8的forEach方法（适用于集合）

List<Integer> numbers = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
numbers.forEach(System.out::println);

7.使用递归（适用于数组和集合）

void printArray(int[] array, int index) {
   if (index < array.length) {
       System.out.println(array[index]);
       printArray(array, index + 1);
   }
}

// 对于集合
void printList(List<Integer> list, int index) {
   if (index < list.size()) {
       System.out.println(list.get(index));
       printList(list, index + 1);
   }
}

8.使用Apache Commons Collections（适用于集合）

List<Integer> list = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
CollectionUtils.forAllDo(list, new Closure() {
   public void execute(Object input) {
       System.out.println(input);
   }
});
