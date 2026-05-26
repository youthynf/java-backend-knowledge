# DispatcherServlet逻辑代码

DispatcherServlet逻辑代码
DispatcherServlet核心逻辑代码：

protected void doDispatch(HttpServletRequest request, HttpServletResponse response) throws Exception {
   // 1. 通过 HandlerMapping 获取处理器（Controller）
   HandlerExecutionChain handler = getHandler(request);

   if (handler != null) {
       // 2. 根据处理器类型找到合适的 HandlerAdapter
       HandlerAdapter ha = getHandlerAdapter(handler.getHandler());

       // 3. 使用适配器调用处理器
       ModelAndView mv = ha.handle(request, response, handler.getHandler());

       // 4. 渲染视图
       processDispatchResult(request, response, handler, mv);
   }
}

protected HandlerExecutionChain getHandler(HttpServletRequest request) throws Exception {
   for (HandlerMapping hm : this.handlerMappings) {
       HandlerExecutionChain handler = hm.getHandler(request);
       if (handler != null) {
           return handler;
       }
   }
   return null; // 如果没有找到匹配的处理器
}
