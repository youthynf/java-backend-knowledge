# token、session、cookie区别是什么？

token、session、cookie区别是什么？
session：存储于服务器，可以理解为一个状态列表，拥有一个唯一识别符号。sessionld，通常存放于cookie中。服务器收到cookie后解析出sessionld，再去session列表中査找，才能找到相应session，依赖cookie；
cookie：类似一个令牌，装有sessionld，存储在客户端，浏览器通常会自动添加；
token：类似一个令牌，无状态，用户信息都被加密到token中，服务器收到token后解密就可知道是哪个用户，需要开发者手动添加。
