function unwrapMessageContent(message) {
    let content = message || {};
    for (let depth = 0; depth < 5; depth++) {
        const wrapped =
            content.ephemeralMessage?.message ||
            content.viewOnceMessage?.message ||
            content.viewOnceMessageV2?.message ||
            content.viewOnceMessageV2Extension?.message ||
            content.documentWithCaptionMessage?.message;
        if (!wrapped) break;
        content = wrapped;
    }
    return content;
}

function extractMessageText(message) {
    const content = unwrapMessageContent(message);
    return {
        content,
        text: String(
            content.conversation ||
            content.extendedTextMessage?.text ||
            content.imageMessage?.caption ||
            content.videoMessage?.caption ||
            content.documentMessage?.caption ||
            content.buttonsResponseMessage?.selectedDisplayText ||
            content.buttonsResponseMessage?.selectedButtonId ||
            content.listResponseMessage?.singleSelectReply?.selectedRowId ||
            content.listResponseMessage?.title ||
            content.templateButtonReplyMessage?.selectedDisplayText ||
            content.templateButtonReplyMessage?.selectedId ||
            ""
        )
    };
}

module.exports = { unwrapMessageContent, extractMessageText };
