// @ts-nocheck
// ---------------------------------------------------------------------------
// 漂流瓶（从 mkbot-core 拆出）
// 由 mkbot-core 注入 readB/writeB/sendReply 等；Vite 与主入口打包为单文件 index.mjs。
// ---------------------------------------------------------------------------

import path from 'path';
import type {
    AuthRcStatus,
    DriftBottleDeps,
    DriftBottleHandleResult,
    MkMessageEvent,
    MkPluginContext,
} from '../types';
import { 合并节点, 段_引用, 段_文本, 段_图片, 发合并消息, 发消息 } from '../BOT';
import { requireAuthorized } from '../lib/unauth-reply';

// ---------------------------------------------------------------------------
// 指令路由（返回 false=未匹配；halt=终止 handleMessage；pass=捞瓶子成功但继续后续指令）
// ---------------------------------------------------------------------------

export async function handleDriftBottleCommands(
    message: string,
    event: MkMessageEvent,
    ctx: MkPluginContext,
    RC_sq: AuthRcStatus,
    娱乐_开关: unknown,
    d: DriftBottleDeps
): Promise<DriftBottleHandleResult> {
    const {
        readB,
        writeB,
        readA,
        writeA,
        timeA,
        rand,
        checkOwner3,
        getDataPath,
        giveText,
        giveImages,
        downloadFile,
    } = d;

    const isMenu = message === "漂流瓶";
    const isVote = message.match(/^(赞|踩)此瓶子$/);
    const isQueryDelete = message.match(/^(删|查)瓶子([0-9]+)$/);
    const isMine = message === "我的瓶子";
    const isThrow = message.match(/^抛瓶子/);
    const isPick = message.match(/^(捞瓶子|捡瓶子)$/);

    if (!isMenu && !isVote && !isQueryDelete && !isMine && !isThrow && !isPick) {
        return false;
    }

    if (娱乐_开关) {

    if (isMenu) {
        // ================== 授权判断 ==================
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        // ================== 检 ==================
        let 组装消息 = ``;
        组装消息 += `══════════════`;
        组装消息 += `\n抛瓶子[内容]/[图片]`;
        组装消息 += `\n捞瓶子`;
        组装消息 += `\n我的瓶子`;
        组装消息 += `\n查瓶子[ID]`;
        组装消息 += `\n删瓶子[ID]`;
        组装消息 += `\n赞此瓶子/踩此瓶子`;
        // ================== 检 ==================
        await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
        return 'halt';
    }

    if (isVote) {
        // ================== 授权判断 ==================
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        // ================== 获取基本数据 ==================
        const lx = message.match(/^(赞|踩)此瓶子$/)[1];
        const mub = readB("筱筱吖/娱乐系统/漂流瓶/赞踩/正在进行.json", event.user_id, "无");
        const zt = readB(`筱筱吖/娱乐系统/漂流瓶/赞踩/投票状态/${event.user_id}.json`, mub, "未");
        // ================== 判断 ==================
        if (mub == "无") {
            await 发消息(event, [段_引用(event.message_id), 段_文本('请你先捞一下瓶子再弄好嘛？')]);
            return 'halt';
        }
        if (zt == "已") {
            await 发消息(event, [段_引用(event.message_id), 段_文本('这个瓶子你已经操作过啦～！')]);
            return 'halt';
        }
        // ================== 写入 ==================
        const zz = readB(`筱筱吖/娱乐系统/漂流瓶/赞踩/${mub}.json`, lx, 0);//原数据
        writeB(`筱筱吖/娱乐系统/漂流瓶/赞踩/${mub}.json`, lx, zz + 1);
        writeB(`筱筱吖/娱乐系统/漂流瓶/赞踩/投票状态/${event.user_id}.json`, mub, "已");
        // ================== 输出 ==================
        let 组装消息 = `已对瓶子【${mub}】进行投票啦～！`;
        await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
        return 'halt';
    }

    if (isQueryDelete) {
        // ================== 授权判断 ==================
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        // ================== 获取数据 ==================
        const ff = message.match(/^(查|删)瓶子([0-9]+)$/)[1];
        const ID = message.match(/^(查|删)瓶子([0-9]+)$/)[2];
        const pz_count = readB("筱筱吖/娱乐系统/漂流瓶/总数据.json", "总数量", 0);
        if (ID == 0 || ID > pz_count) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('好像没有这个ID叭～？')]);
            return 'halt';
        }
        // ================== 读取目标文件 ==================
        let 文件数据 = JSON.parse(readA(`筱筱吖/娱乐系统/漂流瓶/瓶子数据/${ID}.json`));
        let 被捞次数 = readB("筱筱吖/娱乐系统/漂流瓶/被打捞次数.json", ID, 0);
        let 上传者QQ = (文件数据["扔的人"] || "");
        // ================== 判断当事人 ==================
        let 权限 = false;
        const ownerQQs = readB("config.json", "OwnerQQs", []);
        if (上传者QQ == event.user_id) {
            权限 = true;
        } else if (await checkOwner3(event, ctx, false, false)) {
            权限 = true;//主人特权
        } else {
            权限 = false;
        }
        // ================== 你是什么人 ==================
        if (权限 == false) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('这个瓶子好像不是你的吧～？')]);
            return 'halt';
        }
        let 状态 = readB(`筱筱吖/娱乐系统/漂流瓶/删除的.json`, ID, "正常");

        if (ff == "查") {
            // ================== 最终操作 ==================
            let 瓶子图片数据 = (文件数据["图片数据"] || []);
            let 瓶子图片数量 = 瓶子图片数据.length;
            let 瓶子文本内容 = (文件数据["瓶子内容"] || "");
            let 瓶子扔出时间 = timeA("y-m-d H:i:s", 文件数据["扔出时间"] || Math.floor(Date.now() / 1000));
            // ================== 判断异常 ==================
            if (状态 != "正常") {
                await 发消息(event, [段_引用(event.message_id), 段_文本('这个瓶子好像本来就没了吧～？')]);
                return 'halt';
            }
            if (瓶子文本内容 == "" || 瓶子文本内容.length < 3) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('配置数据异常！')]);
                return 'halt';
            }
            if (瓶子图片数量 != 0) {//文本+图片
                const bottleSegments = [段_引用(event.message_id), 段_文本(`${瓶子文本内容}`)];
                for (let i = 0; i < 瓶子图片数量; i++) {
                    let 图片链接 = 瓶子图片数据[i];
                    if (图片链接 == undefined || 图片链接 == "") {
                        continue;
                    }
                    let imagePath = path.join(getDataPath(), `筱筱吖/娱乐系统/漂流瓶/图片数据/${图片链接}`);
                    bottleSegments.push(段_图片(imagePath));
                }
                bottleSegments.push(段_文本(`\n══════════════\n[来自]:${上传者QQ}\n[时间]:${瓶子扔出时间}\n-----------------\n[次数]:${被捞次数}\n══════════════`));
                await 发消息(event, bottleSegments);
                return 'halt';
            } else {
                let 组装消息 = `${瓶子文本内容}`;
                组装消息 += `\n══════════════`;
                组装消息 += `\n[来自]:${上传者QQ}`;
                组装消息 += `\n[时间]:${瓶子扔出时间}`;
                组装消息 += `\n-----------------`;
                组装消息 += `\n[次数]:${被捞次数}`;
                组装消息 += `\n══════════════`;
                await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
                return 'halt';
            }
        }
        if (ff == "删") {
            // ================== 读取数据 ==================
            let 总数 = readB(`筱筱吖/娱乐系统/漂流瓶/删除的.json`, "总删除", 0);
            if (状态 != "正常") {
                await 发消息(event, [段_引用(event.message_id), 段_文本('这个瓶子好像本来就没了吧～？')]);
                return 'halt';
            }
            let 组装消息 = `耗的，这就把【${ID}】的瓶子给抹除了！`;
            await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
            writeB(`筱筱吖/娱乐系统/漂流瓶/删除的.json`, "总删除", 总数 + 1);
            writeB(`筱筱吖/娱乐系统/漂流瓶/删除的.json`, ID, "异常");
            return 'halt';
        }
    }

    if (isMine) {
        // ================== 授权判断 ==================
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        // ================== 获取数据 ==================
        const pz_count = readB("筱筱吖/娱乐系统/漂流瓶/总数据.json", "总数量", 0);

        // ================== 检 ==================
        if (pz_count == 0) {
            return 'halt';
        }

        // ================== 循环遍历 ==================
        let 有效数量 = 0;
        let 组装消息 = "";
        for (let i = 0; i < pz_count; i++) {
            let 本次ID = i + 1;
            let 文件数据 = JSON.parse(readA(`筱筱吖/娱乐系统/漂流瓶/瓶子数据/${本次ID}.json`));
            let 状态 = readB(`筱筱吖/娱乐系统/漂流瓶/删除的.json`, 本次ID, "正常");
            let 上传者QQ = (文件数据["扔的人"] || "");
            // ================== 不是我的 ==================
            if (上传者QQ != event.user_id) {
                continue;
            }
            if (状态 != "正常") {
                continue;
            }
            // ================== 是我的 ==================
            有效数量++;
            let 被捞次数 = readB("筱筱吖/娱乐系统/漂流瓶/被打捞次数.json", 本次ID, 0);
            let 瓶子扔出时间 = timeA("y-m-d H:i:s", 文件数据["扔出时间"] || Math.floor(Date.now() / 1000));
            let dd = readB(`筱筱吖/娱乐系统/漂流瓶/赞踩/${本次ID}.json`, "赞", 0);
            let cc = readB(`筱筱吖/娱乐系统/漂流瓶/赞踩/${本次ID}.json`, "踩", 0);
            组装消息 += `\n【${本次ID}】`;
            组装消息 += `\n - [浏览] : ${被捞次数}次`;
            组装消息 += `\n - [时间] : ${瓶子扔出时间}`;
            组装消息 += `\n - [赞]:${dd}      [踩]:${cc}`;
            组装消息 += `\n`;
        }

        // ================== 输出前验证 ==================
        if (有效数量 == 0) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('窝好像没有找到你的瓶子哎～')]);
            return 'halt';
        }
        let 返回内容 = `你共有「${有效数量}」个瓶子\n══════════════` + 组装消息 + `══════════════`;
        if (有效数量 >= 7) {
            const messages = [
                合并节点("[我的瓶子]", event.self_id, [段_文本(返回内容)]),
            ];
            await 发合并消息(event, messages);
        } else {
            await 发消息(event, [段_引用(event.message_id), 段_文本(返回内容)]);
        }
        return 'halt';
    }

    if (isThrow) {
        // ================== 授权判断 ==================
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        // ================== 获取数据 ==================
        const fullText = giveText(event.message);
        const text = fullText.replace(/^抛瓶子/, "").trim();//内容
        const image = giveImages(event.message);//图片链接
        const image_count = image.length;//图片数
        const text_count = text.length;//字数
        const lineCount = text.split('\n').length;//文本行数
        // ================== 判断 ==================
        if ((text == "" || text == undefined) && image_count == 0) {
            //await sendReply(event, `[CQ:reply,id=${event.message_id}]无内容`, ctx);
            return 'halt';
        }
        if (text_count < 3) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('请包含至少三个字！')]);
            return 'halt';
        }
        if (lineCount > 11 || image_count > 5 || text_count > 500) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('请将内容控制在11行，500字，5图片范围内！')]);
            return 'halt';
        }

        // ================== 执行前置 ==================
        let 数据 = {};
        // ================== 仅文字 ==================
        if (text != "" && image_count == 0) {
            数据 = {"扔的人":event.user_id, "瓶子内容":text, "扔出时间":Math.floor(Date.now() / 1000) };

        // ================== 文字+图片 ==================
        } else if (text != "" && image_count != 0) {
            let 图片数据 = [];
            for (let i = 0; i < image_count; i++) {
                let 随机ID = rand(10000000, 999999999);
                图片数据.push(`${随机ID}.png`);
                downloadFile(image[i], `筱筱吖/娱乐系统/漂流瓶/图片数据/${随机ID}.png`);
            }
            数据 = {"扔的人":event.user_id, "瓶子内容":text, "图片数据":图片数据, "扔出时间":Math.floor(Date.now() / 1000) };

        } else {// ================== 错误返回 ==================
            await 发消息(event, [段_引用(event.message_id), 段_文本('未知错误')]);
            return 'halt';
        }

        // ================== 获取瓶子数据 ==================
        const pz_count = readB("筱筱吖/娱乐系统/漂流瓶/总数据.json", "总数量", 0);
        writeB(`筱筱吖/娱乐系统/漂流瓶/总数据.json`, "总数量", pz_count + 1);
        writeA(`筱筱吖/娱乐系统/漂流瓶/瓶子数据/${pz_count + 1}.json`, JSON.stringify(数据));

        // ================== 输出结果 ==================
        await 发消息(event, [段_引用(event.message_id), 段_文本(`抛成功啦～！\n你的瓶子ID是:${pz_count + 1}`)]);
        /*
        // ================== 调试 ==================
        let 组装消息2 = ``;
        组装消息2 += `图片数量:${image_count}`;
        组装消息2 += `\n图片列表:${JSON.stringify(image)}`;
        await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息2)]);
        */
        return 'halt';
    }

    if (isPick) {
        // ================== 授权判断 ==================
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        // ================== 读取数据 ==================
        const pz_count = readB("筱筱吖/娱乐系统/漂流瓶/总数据.json", "总数量", 0);

        // ================== 判断 ==================
        if (pz_count < 2) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('瓶子数量不足以运行本功能？')]);
            return 'halt';
        }

        // ================== 正常找瓶子 ==================
        let 错误次数 = 0;
        let 最大错误次数 = 5;
        let uxx = false;
        let pickSegments = null;
        for (let i = 0; i < pz_count; i++) {
            if (错误次数 >= 最大错误次数) {
                uxx = false;
                break;
            }
            let 随机数 = rand(1, pz_count);
            let 状态 = readB(`筱筱吖/娱乐系统/漂流瓶/删除的.json`, 随机数, "正常");
            let 文件数据 = JSON.parse(readA(`筱筱吖/娱乐系统/漂流瓶/瓶子数据/${随机数}.json`));
            let 被捞次数 = readB("筱筱吖/娱乐系统/漂流瓶/被打捞次数.json", 随机数, 0);
            let 上传者QQ = (文件数据["扔的人"] || "");
            let 瓶子图片数据 = (文件数据["图片数据"] || []);
            let 瓶子图片数量 = 瓶子图片数据.length;
            let 瓶子文本内容 = (文件数据["瓶子内容"] || "");
            let 瓶子扔出时间 = timeA("y-m-d H:i:s", 文件数据["扔出时间"] || Math.floor(Date.now() / 1000));
            //判断
            if (状态 != "正常") {
                错误次数++;
                continue;
            }
            if (瓶子文本内容 == "" || 瓶子文本内容.length < 3) {
                错误次数++;
                continue;

            } else if (瓶子图片数量 != 0) {//文本+图片
                pickSegments = [段_文本(`${瓶子文本内容}`)];
                for (let j = 0; j < 瓶子图片数量; j++) {
                    let 图片链接 = 瓶子图片数据[j];
                    if (图片链接 == undefined || 图片链接 == "") {
                        continue;
                    }
                    let imagePath = path.join(getDataPath(), `筱筱吖/娱乐系统/漂流瓶/图片数据/${图片链接}`);
                    pickSegments.push(段_图片(imagePath));
                }
            } else {
                pickSegments = [段_文本(`${瓶子文本内容}`)];
            }
            uxx = true;
            let dd = readB(`筱筱吖/娱乐系统/漂流瓶/赞踩/${随机数}.json`, "赞", 0);
            let cc = readB(`筱筱吖/娱乐系统/漂流瓶/赞踩/${随机数}.json`, "踩", 0);
            writeB("筱筱吖/娱乐系统/漂流瓶/被打捞次数.json", 随机数, 被捞次数 + 1)
            writeB("筱筱吖/娱乐系统/漂流瓶/赞踩/正在进行.json", event.user_id, 随机数);
            pickSegments.push(段_文本(`\n══════════════\n[来自]:${上传者QQ}\n[时间]:${瓶子扔出时间}\n-----------------\n[被捞]:${被捞次数 + 1}次\n[赞]:${dd}      [踩]:${cc}\n══════════════`));
            break;
        }

        // ================== 输出 ==================
        if (uxx == false) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('多次打捞都找不到～(∩ᵒ̴̶̷̤⌔ᵒ̴̶̷̤∩)')]);
            return 'halt';
        }
        await 发消息(event, [段_引用(event.message_id), ...(pickSegments || [段_文本("")])]);
        return 'pass';
    }

    } // 娱乐_开关

    return false;
}
