# 线程池中的shutdown()与shutdownNow()有什么区别？

线程池中的shutdown()与shutdownNow()有什么区别？
线程池中的shutdown()与shutdownNow()两个方法作用：
shutdown()：
将线程池状态设置SHUTDOWN，正在执行的任务继续执行，未执行的不予执行，新加入的任务直接抛RejectedExecutionException异常；

shutdownNow()：
线程池状态为STOP，并试图通过Thread.interrupt()方法来终止线程，但是需要线程支持中断，如果线程中没有sleep、wait、Contition、定时锁等应用，终止失效，所以线程池可能还是需要等待所有正在执行的任务都执行完成了才能退出。
