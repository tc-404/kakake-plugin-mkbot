// @ts-nocheck
// ---------------------------------------------------------------------------
// 群老婆（从 mkbot-core 拆出）
// 由 mkbot-core 注入 readB/writeB/sendReply 等；Vite 与主入口打包为单文件 index.mjs。
// ---------------------------------------------------------------------------

import type {
    AuthRcStatus,
    GroupWifeDeps,
    MkMessageEvent,
    MkPluginContext,
} from '../types';
import { 合并节点, 段_引用, 段_文本, 段_图片, 发合并消息, 发消息 } from '../BOT';
import { requireAuthorized } from '../lib/unauth-reply';

// ---------------------------------------------------------------------------
// 指令路由（群老婆菜单、设置、抽取；返回 true 表示已消费指令）
// ---------------------------------------------------------------------------

export async function handleGroupWifeCommands(
    message: string,
    event: MkMessageEvent,
    ctx: MkPluginContext,
    RC_sq: AuthRcStatus,
    娱乐_开关: unknown,
    d: GroupWifeDeps
): Promise<boolean> {
    const { readB, writeB, readA, writeA, timeA, rand, BOTAPI, checkOwner3 } = d;

    if (message == "群老婆" && 娱乐_开关) {
        // ================== 判断 ==================
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return true;
        }
        if (event.message_type != "group") {
            await 发消息(event, [段_引用(event.message_id), 段_文本('该功能目前仅支持群聊使用哦～')]);
            return true;
        }
        // ================== 组装消息 - 2 ==================
        let 组装消息1 = `══════════════`;
        组装消息1 += `\n普通指令↓`;
        组装消息1 += `\n - 我的老婆 / 我的老公`;
        组装消息1 += `\n - 今日老婆 / 今日老公`;
        组装消息1 += `\n - 更换老婆 / 更换老公`;
        组装消息1 += `\n`;
        组装消息1 += `\n管理员指令↓`;
        组装消息1 += `\n - 更改群老婆范围全群模式`;
        组装消息1 += `\n - 更改群老婆范围单群模式`;
        组装消息1 += `\n - 更改群老婆冷却[时长:秒]`;
        组装消息1 += `\n - [开启|关闭]群老婆过滤官机`;
        组装消息1 += `\n - [开启|关闭]群老婆过滤本人`;
        组装消息1 += `\n══════════════`;
        // ================== 组装消息 - 2 ==================
        let 组装消息2 = `══════════════`;
        组装消息2 += `\n1.本功能默认开启，无法关闭`;
        组装消息2 += `\n2.默认单群模式，即每一个群分开计算`;
        组装消息2 += `\n3.群聊总数>30/有某群人数>1000的群，不建议开启全群模式`;
        组装消息2 += `\n4.全群模式，也就是获取本账号全部群聊中的全部人数据进行随机抽取`;
        组装消息2 += `\n5.管理员指令对全局生效，不会单针对某一个群`;
        组装消息2 += `\n6.开全群模式玩死机了别找我！`;
        组装消息2 += `\n══════════════`;
        // ================== 组装消息 - 3 ==================
        let 组装消息3 = `══════════════`;
        组装消息3 += `\nMK2.2.2起，启用缓存机制`;
        组装消息3 += `\n - 无论是单群或是全群`;
        组装消息3 += `\n - 每小时首次有人要用该功能时，都会来一次缓存`;
        组装消息3 += `\n - 缓存有效期:这个小时内`;
        组装消息3 += `\n`;
        组装消息3 += `\n - 额外:`;
        组装消息3 += `\n - 「群老公」为严谨模式，必须性别设定是“男”才可抽中，「群老婆」获取的为“隐私”或“女”或“未设置”等`;
        组装消息3 += `\n══════════════`;
        // ================== 输出 ==================
        const messages = [
            合并节点("[群老婆]", event.self_id, [段_文本(组装消息1)]),
            合并节点("[群老婆]", event.self_id, [段_文本(组装消息2)]),
            合并节点("[群老婆]", event.self_id, [段_文本(组装消息3)]),
        ];
        await 发合并消息(event, messages);
        return true;
    }

    if (message.match(/^(开启|关闭)群老婆(过滤本人|过滤官机)$/) && 娱乐_开关) {
        // ================== 授权判断 ==================
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return true;
        }
        // ================== 最高主人检测 ==================
        let crr_开关 = false;
        if (event.message_type == "group") {
            let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
            if (rrrrv == "开启") {
                crr_开关 = true;
            }
        }
        if (!(await checkOwner3(event, ctx, crr_开关, false))) return true;
        // ================== 获取数据 ==================
        const 操作 = message.match(/^(开启|关闭)群老婆(过滤本人|过滤官机)$/)[1];
        const 类型 = message.match(/^(开启|关闭)群老婆(过滤本人|过滤官机)$/)[2];
        // ================== 判断类型 ==================
        let 读 = "过滤本人";
        if (类型 == "过滤本人") {
            读 = "过滤本人";
        } else {
            读 = "过滤人机";
        }
        // ================== 读取 ==================
        let 开关 = readB("筱筱吖/娱乐系统/今日老婆/处理.json", 读, "开启");
        if (开关 == 操作) {
            await 发消息(event, [段_引用(event.message_id), 段_文本(`目前【${类型}】已经处于「${开关}」状态啦！不能再弄啦！！！`)]);
            return true;
        }
        // ================== 写入🐔输出 ==================
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒，这就把【${类型}】的开关改成「${操作}」`)]);
        writeB("筱筱吖/娱乐系统/今日老婆/处理.json", 读, 操作);
        return true;
    }

    if (message.match(/^更改群老婆范围(单群模式|全群模式)$/) && 娱乐_开关) {
        // ================== 来源 ==================
        if (event.message_type != "group") {
            return true;
        }
        // ================== 授权判断 ==================
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return true;
        }
        // ================== 最高主人检测 ==================
        let crr_开关 = false;
        if (event.message_type == "group") {
            let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
            if (rrrrv == "开启") {
                crr_开关 = true;
            }
        }
        if (!(await checkOwner3(event, ctx, crr_开关, false))) return true;
        // ================== 检 ==================
        const one_mub = message.match(/^更改群老婆范围(单群模式|全群模式)$/)[1];
        let 方法类型 = readB("筱筱吖/娱乐系统/今日老婆/处理.json", "类型", "单群模式");//单或全
        if (one_mub == 方法类型) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('与原来的一样啦～！')]);
            return true;
        }
        // ================== 检 ==================
        writeB("筱筱吖/娱乐系统/今日老婆/处理.json", "类型", one_mub);//单或全
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒～！这就把设置群老婆的范围改成 ${one_mub}！`)]);
        return true;
    }

    if (message.match(/^更改群老婆冷却([0-9]+)$/) && 娱乐_开关) {
        // ================== 来源 ==================
        if (event.message_type != "group") {
            return true;
        }
        // ================== 授权判断 ==================
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return true;
        }
        // ================== 最高主人检测 ==================
        let crr_开关 = false;
        if (event.message_type == "group") {
            let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
            if (rrrrv == "开启") {
                crr_开关 = true;
            }
        }
        if (!(await checkOwner3(event, ctx, crr_开关, false))) return true;
        // ================== 检 ==================
        const one_mub = JSON.parse(message.match(/^更改群老婆冷却([0-9]+)$/)[1]);
        let 时长 = readB("筱筱吖/娱乐系统/今日老婆/处理.json", "冷却", 30);
        if (one_mub == 时长) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('与原来的一样啦～！')]);
            return true;
        }
        // ================== 检 ==================
        writeB("筱筱吖/娱乐系统/今日老婆/处理.json", "冷却", one_mub);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒～！这就把设置群老婆的冷却改成 ${one_mub}秒！`)]);
        return true;
    }

    if (message.match(/^(今日|我的|换群|更换)(老婆|老公)$/) && 娱乐_开关) {
        // ================== 来源 ==================
        if (event.message_type != "group") {
            return true;
        }
        // ================== 授权判断 ==================
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return true;
        }

        // ================== 获取数据 - 1 ==================
        let 方法类型 = readB("筱筱吖/娱乐系统/今日老婆/处理.json", "类型", "单群模式");//单或全
        let 读写路径 = `筱筱吖/娱乐系统/今日老婆/群组模式/全群模式/`;
        if (方法类型 == "单群模式") {
            读写路径 = `筱筱吖/娱乐系统/今日老婆/群组模式/分群模式/${event.group_id}/`;
        } else {
            读写路径 = `筱筱吖/娱乐系统/今日老婆/群组模式/全群模式/`;
        }
        // ================== 获取数据 - 2 ==================
        let 时间 = Math.floor(Date.now() / 1000);
        let 今天 = timeA("y-m-d", Math.floor(Date.now() / 1000));
        let 昨天 = timeA("y-m-d", Math.floor(Date.now() / 1000) - 86400);
        let 现在小时 = timeA("y-m-d-H", Math.floor(Date.now() / 1000));
        let 昨日老婆 = readB(读写路径 + `${昨天}/记录.json`, event.user_id, 0);
        let 今日老婆 = readB(读写路径 + `${今天}/记录.json`, event.user_id, 0);
        let 来源记录 = readB(读写路径 + `${今天}/记录2.json`, event.user_id, 0);
        let 性别记录 = readB(读写路径 + `${今天}/记录3.json`, event.user_id, 0);
        let 记录时间 = readB(读写路径 + `${今天}/冷却.json`, event.user_id, 0);
        let 过滤人机 = readB("筱筱吖/娱乐系统/今日老婆/处理.json", "过滤人机", "开启");
        let 过滤本人 = readB("筱筱吖/娱乐系统/今日老婆/处理.json", "过滤本人", "开启");

        // ================== 判断冷却 ==================
        let 指令 = message.match(/^(今日|我的|换群|更换)(老婆|老公)$/)[1];
        let 指定 = message.match(/^(今日|我的|换群|更换)(老婆|老公)$/)[2];
        let 时长 = readB("筱筱吖/娱乐系统/今日老婆/处理.json", "冷却", 30);
        if (时间 - 记录时间 < 时长 && (指令 == "换群老婆" || 指令 == "更换老婆")) {
            let 倒计时 = 时长 - (时间 - 记录时间);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`冷却时间要${时长}秒哟～\n再等${倒计时}秒再来吧～！`)]);
            return true;
        }

        let iii = 来源记录;
        if (来源记录 == event.group_id) {
            iii = "本群";
        }
        // ================== 还想抽？ -  类型判断 ==================
        //检测当前用户是否已经有过了
        if ((指令 == "今日" || 指令 == "我的") && 今日老婆 != 0) {
            //发今日老婆，也就是想第一次抽取，但他已经抽过了
            let 参数 = { user_id: 今日老婆 };
            let dp = await BOTAPI(ctx, "get_stranger_info", 参数);
            // ================== 检 ==================
            let 头像链接 = `https://q4.qlogo.cn/g?b=qq&nk=${今日老婆}&s=5`;
            let 组装消息头 = `══════════════`;
            组装消息头 += `\n❌ 你今天已经抽过啦～`;
            组装消息头 += `\n你如果要更换的话请发「更换老婆」「更换老公」`;
            组装消息头 += `\n══════════════`;
            let 组装消息尾 = `[昵称]:${dp?.nick || dp?.nickname || "-"}`;
            组装消息尾 += `\n[类型]:${性别记录}`;
            组装消息尾 += `\n[来源]:${iii}`;
            组装消息尾 += `\n══════════════`;
            await 发消息(event, [
                段_引用(event.message_id),
                段_文本(组装消息头),
                段_图片(头像链接),
                段_文本(组装消息尾),
            ]);
            return true;
        }
        if ((指令 == "更换老婆" || 指令 == "换群老婆") && 今日老婆 == 0) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('你今天好像还没抽过哎～？要不你先抽一下？')]);
            return true;
        }

        // ================== 匹配数据类型 ==================
        let data = [];
        if (方法类型 == "全群模式") {
            let 总群数据 = await BOTAPI(ctx, "get_group_list", {});
            let 总群数量 = (Object.keys(总群数据).length || 0);
            if (总群数量 == 0) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('好像获取群聊列表失败了唉？～')]);
                return true;
            }
            // ================== 读取缓存数据 ==================
            let 缓存 = JSON.parse(readA(读写路径 + `${今天}/缓存数据/${现在小时}.json`) || "[]");
            if (缓存.length == 0) {
                // ================== 循环前置 ==================
                let 数量锁 = 10;
                let 已数量 = 0;
                // ================== 循环开始 ==================
                for (let i = 0; i < 总群数量; i++) {//循环遍历人数(全部人)
                    let 来自群 = 总群数据[i]["group_id"];
                    let 参数 = { group_id: 来自群 };
                    let dp = await BOTAPI(ctx, "get_group_member_list", 参数);//访问来源群成员列表
                    let 群总人数 = Object.keys(dp).length;//当前列表总人数
                    //字循环
                    for (let i = 0; i < 群总人数; i++) {
                        let 组装消息 = {};
                        组装消息["来自"] = 来自群;
                        组装消息["QQ"] = dp[i].user_id;
                        组装消息["昵称"] = dp[i].nickname;
                        组装消息["机器人"] = dp[i].is_robot;;
                        组装消息["性别"] = dp[i].sex;
                        data.push(组装消息);//直接传递到data
                    }
                    已数量++;
                    if (总群数量 >= 20 && 已数量 >= 数量锁) {
                        await new Promise(resolve => setTimeout(resolve, 2 * 1000));//延迟
                        已数量 = 0;
                    }
                }
                // ================== 写入记录缓存 ==================
                writeA(读写路径 + `${今天}/缓存数据/${现在小时}.json`, JSON.stringify(data));
            } else {
                data = 缓存;
            }
        } else {
            // ================== 读取缓存数据 ==================
            let 缓存 = JSON.parse(readA(读写路径 + `${今天}/缓存数据/${现在小时}.json`) || "[]");
            if (缓存.length == 0) {
                //单群模式(本群)
                let 参数 = { group_id: event.group_id };
                let dp = await BOTAPI(ctx, "get_group_member_list", 参数);
                // ================== 循环前置 ==================
                let 群总人数 = Object.keys(dp).length;
                if (群总人数 == 0) {
                    //什么群tm0个人
                    await 发消息(event, [段_引用(event.message_id), 段_文本('❌群聊模式获取失败：群成员列表获取失败！1')]);
                    return true;
                }
                let 来自群 = event.group_id;
                for (let i = 0; i < 群总人数; i++) {
                    let 组装消息 = {};
                    组装消息["来自"] = 来自群;
                    组装消息["QQ"] = dp[i].user_id;
                    组装消息["昵称"] = dp[i].nickname;
                    组装消息["机器人"] = dp[i].is_robot;
                    组装消息["性别"] = dp[i].sex;
                    data.push(组装消息);//直接传递到data
                }
                // ================== 写入记录缓存 ==================
                writeA(读写路径 + `${今天}/缓存数据/${现在小时}.json`, JSON.stringify(data));
            } else {
                data = 缓存;
            }
        }

        // ================== 检 ==================
        //writeA("测试/3.json", JSON.stringify(data));//调试
        let 总人数 = Object.keys(data).length;
        if (总人数 == 0) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('全部群就获取到0个人？？？')]);
            return true;
        }

        // ================== 循环 - 前置==================
        let 历史老婆 = [];
        历史老婆.push(昨日老婆);
        历史老婆.push(今日老婆);
        let 可重复数 = 5;//最大重复次数
        let 错误累计 = 0;
        // ================== 循环 - 开始 ==================
        for (let i = 1; i < 总人数; i++) {
            // ================== 获取&匹配 ==================
            let 随机数 = rand(0, 总人数 - 1);
            let suijiQQ = String(data[随机数].QQ);//随机到的QQ
            let 是否重复 = 历史老婆.includes(suijiQQ);

            // ================== 过滤系统 - 1 ==================
            if (是否重复) {
                if (错误累计 >= 可重复数) {
                    await 发消息(event, [段_引用(event.message_id), 段_文本('我找了好几次都匹配不中唉？～要不待会再来？')]);
                    return true;
                }
                //logger.error("检测到重复");//调试
                错误累计++;
                continue;
            }
            // ================== 其他检测 - 2 ==================
            if (过滤人机 == "开启" && data[随机数].机器人 == true) {
                if (错误累计 >= 可重复数) {
                    await 发消息(event, [段_引用(event.message_id), 段_文本('我找了好几次都匹配不中唉？～要不待会再来？')]);
                    return true;
                }
                //logger.error("检测到机器人");//调试
                错误累计++;
                continue;
            }
            // ================== 其他本人&机器人 - 3 ==================
            if (过滤本人 == "开启" && (data[随机数].QQ == event.self_id || data[随机数].QQ == event.user_id)) {
                //过滤发言人和机器人本人账号
                if (错误累计 >= 可重复数) {
                    await 发消息(event, [段_引用(event.message_id), 段_文本('我找了好几次都匹配不中唉？～要不待会再来？')]);
                    return true;
                }
                //logger.error("检测到本人");//调试
                错误累计++;
                continue;
            }

            // ================== 检测是否为指定值 ==================
            let zdxb = "female";
            let nana = "老婆";
            if (指定 == "老公") {
                zdxb = "male";
                nana = "老公";
                if (data[随机数].性别 != "male") {
                    错误累计++;
                    continue;
                }
            }

            let lll = data[随机数].来自;
            if (data[随机数].来自 == event.group_id) {
                lll = "本群";
            }

            // ================== 正常写入 ==================
            writeB(读写路径 + `${今天}/记录.json`, event.user_id, suijiQQ);
            writeB(读写路径 + `${今天}/记录2.json`, event.user_id, data[随机数].来自);
            writeB(读写路径 + `${今天}/记录3.json`, event.user_id, nana);
            writeB(读写路径 + `${今天}/冷却.json`, event.user_id, Math.floor(Date.now() / 1000));//记录时间戳秒
            // ================== 正常总结 ==================
            let 头像链接 = `https://q4.qlogo.cn/g?b=qq&nk=${suijiQQ}&s=5`;
            let 组装消息头 = `══════════════`;
            组装消息头 += `\n✅成功获取新的群友老婆啦～`;
            组装消息头 += `\n══════════════`;
            let 组装消息尾 = `[昵称]:${data[随机数].昵称}`;
            组装消息尾 += `\n[类型]:${nana}`;
            组装消息尾 += `\n[来自]:${lll}`;
            组装消息尾 += `\n══════════════`;
            await 发消息(event, [
                段_引用(event.message_id),
                段_文本(组装消息头),
                段_图片(头像链接),
                段_文本(组装消息尾),
            ]);
            return true;
        }
        // ================== 输出结果 ==================
        return true;
    }

    return false;
}
