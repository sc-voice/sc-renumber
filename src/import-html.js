(function(exports) {
    const fs = require('fs');
    const path = require('path');
    const {
        js,
        logger,
        LOCAL_DIR,
    } = require('just-simple').JustSimple;
    const {
        SuttaCentralId,
    } = require('scv-bilara');
    const BILARA_PATH = path.join(LOCAL_DIR, 'bilara-data');

    class Importer {
        constructor(suid, opts={}) {
            logger.logInstance(this, opts);
            this.suid = suid;
            this.segid = new SuttaCentralId(`${suid}:0.1`);
            this.nikayaFolder = this.segid.nikayaFolder;
            this.section = 0;
            this.segVar = {};
            this.segRoot = {};
            this.segTrans = {};
            this.transTextLength = 0;
            this.segRef = {};
            this.segHtml = { };
            this.header = 0;
            this.heading = 0;
            this.prevLine = '';
            this.paraPrefix = '';
            this.div = 0;
            this.sc = '';
            this.rootLang = opts.rootLang || 'pli';
        }

        importLine(line,nextLine) {
            var {
                segid_1,
                segHtml,
                prevLine,
            } = this;
            var { segid, sc } = this.identifyLine(line);
            this.segid = segid;
            this.sc = sc;
            if (line.match('<section')) {
                this.importId(line);
            } else if (line.match('class="division"')) {
                this.importDivision(line);
            } else if (line.match(/^<h[1-9]/)) {
                this.importH(line, nextLine);
            } else if (line.match(/^<\/?div/)) {
                this.importDiv(line);
            } else if (line.match(/^<p/)) {
                this.importText(line, prevLine, nextLine);
            } else if (line.match(/^<a\b/)) {
                this.importText(line, prevLine, nextLine);
            } else if (line.match(/<blockquote/)) {
                this.paraPrefix = line;
            } else if (line.match(/<\/blockquote/)) {
                this.paraSuffix = line;
            } else {
                // console.log(`dbg ignore`, line);
            }
            this.prevLine = line;
        }

        scOfLine(line) {
            return /\bsc[0-9 ]*,/.test(line)
                ? line.replace(/.*\bsc([0-9]+).*/,'$1')
                : this.sc;
        }

        importId(line) {
            var {
                suid,
                segid,
            } = this;
            var parts = line.split('"');
            parts.pop();
            var id = parts.pop();
            if (id !== suid) {
                throw new Error(`File/Id mismatch: ${suid} ${id}`);
            }
            return id;
        }

        importDivision(line) {
            var {
                suid,
                segid,
                section,
                segRoot,
                segTrans,
                segHtml,
            } = this;
            this.segid_1 = segid;
            segRoot[segid.scid] = this.rootText(line);
            segTrans[segid.scid] = this.transText(line);
            segHtml[segid.scid] = this.htmlText(line, 'division');
            this.segid = segid.add(0,1);
        }

        identifyLine(line) {
            var parts = line.split('data-uid="');
            var {
                segid,
                sc:scCur,
            } = this;
            var sc = /\bdata-ref.*sc[0-9 ]+/.test(line)
                ? line.replace(/.*\bsc([0-9]+).*/,'$1')
                : scCur;
            return { segid, sc };
        }

        importH(line, nextLine, h) {
            this.heading++;
            var {
                suid,
                segid,
                sc,
                section,
                segid_1,
                segRoot,
                segTrans,
                segHtml,
                heading,
            } = this;
            var nextHdg = /<h/.test(nextLine);
            var h = line.substring(1,3);
            if (h === 'h1') {
                var text = this.rootText(line);
                this.segid_1 = segid;
                segRoot[segid.scid] = text;
                segTrans[segid.scid] = this.transText(line);
                segHtml[segid.scid] = this.htmlText(line, 'h1');
                this.segid = segid.add(0,1);
            } else {
                if (sc === '') {
                    var nextSc = this.scOfLine(nextLine);
                    var segParts = segid.segmentParts();
                    if (nextSc === sc) {
                        this.segid = segid = 
                            new SuttaCentralId(`${suid}:1.0.1`);
                    } else if (segParts.length === 2) {
                        this.segid = segid = 
                            new SuttaCentralId(`${suid}:1.0`);
                    } else {
                        // e.g., ds1.2.html first h3
                    }
                    this.segid = segid.add(0,0,1);
                } else {
                    var sc1 = Number(sc)+1;
                    if (heading > 1 || nextHdg) {
                        segid = new SuttaCentralId(
                            `${suid}:${sc1}.0.${heading}`);
                    } else {
                        segid = new SuttaCentralId(`${suid}:${sc1}.0`);
                    }
                    if (!nextHdg) {
                        this.segid = new SuttaCentralId(`${suid}:${sc1}.1`);
                    }
                }
                this.segid_1 = segid;
                segRoot[segid.scid] = this.rootText(line);
                segTrans[segid.scid] = this.transText(line);
                segHtml[segid.scid] = this.htmlText(line, h);
            }
        }

        importDiv(line) {
            var {
                div,
            } = this;
            var quoteParts = line.split('"');
            if (line.match(/<div/)) {
                this.div++;
                quoteParts.pop(); // >
                if (quoteParts[1] === 'text') {
                    this.rootLang = quoteParts.pop();
                }
            } else {
                this.div--;
            }
        }

        importText(line, prevLine, nextLine) {
            var {
                segid_1,
                section,
                suid,
                segRoot,
                segTrans,
                segVar,
                segRef,
                segHtml,
                segid,
                sc,
            } = this;
            var refText = this.refText(line);
            var varText = this.varText(line);
            var text = this.rootText(line);
            var lastSegParts = segid_1.segmentParts();
            var curSegParts = segid.segmentParts();
            var cls = '';
            this.heading = 0;
            if (/p class=/.test(line)) {
                cls = line.split('class="')[1].split('"')[0];
            }
            if (this.sc === '' || this.sc < 6) {
                let s = this.segRoot['ds2.1.1:1.0'];
            }
            if (sc === '') {
                var segParts = segid.segmentParts();
                this.segid = segParts.length === 2
                    ? segid.add(0,1)
                    : segid.add(0,0,1);
            } else if (sc === '1' && (
                curSegParts[curSegParts.length-1]==='0' ||
                curSegParts[1]==='0' ||
                curSegParts[0] !== '1')) {
                segid = new SuttaCentralId(`${suid}:${sc}.1`);
                this.segid = segid.add(0,1);
            } else {
                if (curSegParts[0] !== sc) {
                    segid = new SuttaCentralId(`${suid}:${sc}.1`);
                }
                this.segid = segid.add(0,1);
            }
            segRoot[segid.scid] = text;
            segTrans[segid.scid] = this.transText(line);
            refText && (segRef[segid.scid] = refText);
            varText && (segVar[segid.scid] = varText);

            // HTML
            var html = line.trim()
                .replace(/<a.*\/a>/,'{}');
            if (html.match(/<p/u)) {
                html = `${this.paraPrefix}${html}`;
                this.paraPrefix = '';
            }
            if (nextLine.match(/<\/blockquote/u)) {
                html = `${html}${nextLine.trim()}`;
            }
            segHtml[segid.scid] = html.replace(/"/ug, "'");


            this.segid_1 = segid;
        }

        alignSegVar() {
            var {
                suid,
                segRoot,
                segVar,
            } = this;
            var rootIds = Object.keys(segRoot);
            var segVarNew = {};
            Object.keys(segVar).forEach(k=>{
                var vk = segVar[k];
                var arrowParts = vk.split('→');
                var termParts = arrowParts[0].split('|');
                if (termParts.length > 1) {
                    var term = termParts[termParts.length-1].trim();
                } else {
                    var term = termParts[0].trim();
                }

                for (var i=0; i<rootIds.length; i++) {
                    var rootId = rootIds[i];
                    var rv = segRoot[rootId];
                    var imatch = rv.indexOf(term);
                    if (imatch>=0) { // keyword found in segment
                        var sv = segVarNew[rootId];
                        if (sv) {
                            if (sv.indexOf(term) >= 0) {
                                continue; // already has variant
                            }
                            segVarNew[rootId] = `${sv} | ${vk}`;
                        } else {
                            segVarNew[rootId] = vk;
                        }
                        break;
                    }
                };
                if (i === rootIds.length) {
                    segVarNew[k] = vk;
                    if (arrowParts.length > 1) {
                        logger.warn([ 
                            `${suid}:${k}`,
                            `Could not match ${term} from ${vk}`,
                        ].join(' '));
                    }
                }
            });
            this.segVar = segVarNew;
        }

        htmlText(line, element) {
            var {
                suid,
                segid,
                section,
                segid,
                sc,
            } = this;
            var sectid = segid.sectionParts();
            if (element === 'header') {
                return this.header++ === 0
                    ? `<header><p class='collection'>{}</p>`
                    : `<p class='collection'>{}</p>`;
            } else if (element === 'division') {
                return this.header++ === 0
                    ? `<header><p class='division'>{}</p>`
                    : `<p class='division'>{}</p>`;
            } else if (element === 'kanda') {
                return this.header++ === 0
                    ? `<header><p class='kanda'>{}</p>`
                    : `<p class='kanda'>{}</p>`;
            } else if (element === 'vagga') {
                return this.header++ === 0
                    ? `<header><p class='vagga'>{}</p>`
                    : `<p class='vagga'>{}</p>`;
            } else if (element === 'section') {
                this.section = ++section;
                return [
                    `<section class='sutta' data-uid='${sectid}' `+
                        `id='${section}'>`,
                    `<article>`,
                    `<div class='hgroup'>`,
                    `<h1>{}</h1>`,
                    `</div>`,
                ].join('');
            }
            if (element === 'h1') {
                return `<h1>{}</h1></header>`;
            }
            if (element === 'h2') {
                return `<h2>{}</h2>`
            }
            if (element === 'h3') {
                return `<h3>{}</h3>`
            }
            if (element === 'h4') {
                return `<h4>{}</h4>`
            }
            if (element === 'h5') {
                return `<h5>{}</h5>`
            }
            if (element === 'h6') {
                return `<h6>{}</h6>`
            }
            if (element === 'h7') {
                return `<h7>{}</h7>`
            }
            if (element === 'h8') {
                return `<h8>{}</h8>`
            }
            if (element === 'h9') {
                return `<h9>{}</h9>`
            }

            return '{}';
        }

        rootText(line) {
            var parts = line.split('<i>');
            parts.shift(); // discard stuff preceding <i>
            return parts.map(p=>p.replace(/<\/i>.*/,'')).join('\n');
        }

        refText(line) {
            return line.match(/data-ref/) 
                ? line.replace(/.*data-ref="/,'').split('"')[0]
                : null;
        }

        varText(line) {
            return line.match(/data-var/) 
                ? line.replace(/.*data-var="/,'').split('"')[0]
                : null;
        }

        transText(line) {
            var parts = line.split('<b>');
            parts.shift(); // discard stuff preceding <b>
            var text = parts.map(p=>p.replace(/<\/b>.*/,'')).join('\n');
            this.transTextLength += text.length;
            return text;
        }

    }

    class ImportHtml {
        constructor(opts={}) {
            logger.logInstance(this, opts);
            this.srcRoot = opts.srcRoot || path.join(LOCAL_DIR, 'html');
            this.dstRoot = opts.dstRoot || BILARA_PATH;
            this.dstFolder = opts.dstFolder || "abhidhamma";
            this.type = opts.type || 'root';
            this.author = opts.author || 'ms';
            this.rootLang = opts.rootLang || 'pli';
            this.translator = opts.translator || 'sujato';
            this.transLang = opts.transLang || 'en';
        }

        import(src,srcFolder) {
            var {
                srcRoot,
                dstRoot,
                dstFolder,
                nikayaFolder,
                type,
                author,
                rootLang,
                translator,
                transLang,
            } = this;
            var srcPath = srcFolder 
                ? path.join(srcRoot, srcFolder, src)
                : path.join(srcRoot, src);
            if (!fs.existsSync(srcPath)) {
                throw new Error(`import file not found:${srcPath}`);
            }
            try {
                var rawLines = fs.readFileSync(srcPath)
                    .toString().split('\n');
            } catch (e) {
                console.error(`could not readFileSync(${srcPath})`);
                throw e;
            }
            var lines = rawLines.reduce((a,line) => {
                var parts = line.split(/<a\b/);
                if (parts.length === 1) {
                    a.push(line);
                } else {
                    var rem = parts[0];
                    for (var i = 1; i < parts.length; i++) {
                        var pi = parts[i];
                        a.push(`${rem}<a${pi}`);
                        rem = '';
                    }
                    if (rem) {
                        a.push(`${a.pop()}${rem}`);
                    }
                }
                return a;
            }, []);
            var suid = src.replace('.html','');

            var importer = new Importer(suid, this);
            for (let i=0; i < lines.length; i++) {
                importer.importLine(lines[i], lines[i+1]);
            }
            importer.alignSegVar();
            var {
                segid_1,
                nikayaFolder,
                segRoot,
                segTrans,
                segRef,
                segVar,
                segHtml,
                transTextLength,
            } = importer;
            var outFolder = srcFolder 
                ? path.join(dstFolder, nikayaFolder, srcFolder)
                : path.join(dstFolder, nikayaFolder);
            var segids = Object.keys(segRoot)
                .sort(SuttaCentralId.compareLow);
            var nsegids = segids.length;

            try { // write root segments
                var dstDir = path.join(dstRoot, 'root', rootLang, author,
                    outFolder);
                fs.mkdirSync(dstDir, {recursive: true});
                var dstPath = path.join(dstDir,
                    `${suid}_root-${rootLang}-${author}.json`);
                fs.writeFileSync(dstPath, JSON.stringify(segRoot, null, 2));
                var localPath = dstPath.replace(LOCAL_DIR,'').substring(1);
            } catch (e) {
                console.error(`root => ${localPath}`, e.stack);
                throw e;
            }

            try { // write translation segments
                if (transTextLength) {
                    var dstDir = path.join(dstRoot, 
                        'translation', transLang, translator,
                        outFolder);
                    fs.mkdirSync(dstDir, {recursive: true});
                    var dstPath = path.join(dstDir,
                        `${suid}_translation-${transLang}-${translator}`+
                        `.json`);
                    fs.writeFileSync(dstPath, 
                    JSON.stringify(segTrans, null, 2));
                }
                var localPath = dstPath.replace(LOCAL_DIR,'').substring(1);
            } catch (e) {
                console.error(`translation ${localPath}`, e.stack);
                throw e;
            }

            try { // write reference segments
                var dstDir = path.join(dstRoot, 'reference', 'pli', 'ms',
                    outFolder);
                fs.mkdirSync(dstDir, {recursive: true});
                var dstPath = path.join(dstDir, `${suid}_reference.json`);
                fs.writeFileSync(dstPath, JSON.stringify(segRef, null, 2));
                var localPath = dstPath.replace(LOCAL_DIR,'').substring(1);
            } catch (e) {
                console.error(`reference ${localPath}`, e.stack);
                throw e;
            }

            try { // write variant segments
                var dstDir = path.join(dstRoot, 'variant/pli/ms', 
                    outFolder);
                fs.mkdirSync(dstDir, {recursive: true});
                var dstPath = path.join(dstDir, 
                    `${suid}_variant-${rootLang}-${author}.json`);
                if (Object.keys(segVar).length) {
                    fs.writeFileSync(dstPath, 
                        JSON.stringify(segVar, null, 2));
                    var localPath = dstPath.replace(LOCAL_DIR,'')
                        .substring(1);
                } else if (fs.existsSync(dstPath)) {
                    fs.unlinkSync(dstPath);
                }
            } catch (e) {
                console.error(`variant ${localPath}`, e.stack);
                throw e;
            }

            try {// write Html segments
                var dstDir = path.join(dstRoot, 'html', 'pli', 'ms',
                    outFolder);
                fs.mkdirSync(dstDir, {recursive: true});
                var dstPath = path.join(dstDir, `${suid}_html.json`);
                fs.writeFileSync(dstPath, JSON.stringify(segHtml, null, 2));
                var localPath = dstPath.replace(LOCAL_DIR,'').substring(1);
            } catch (e) {
                console.error(`HTML ${localPath}`, e.stack);
                throw e;
            }

            logger.info(`imported ${suid}`);

            return {
                suid,
                segTrans,
                segVar,
                segRoot,
                segRef,
                segHtml,
                rootLang,
                author,
                translator,
                transLang,
                transTextLength,
                segments: Object.keys(segRoot).map(k => ({[k]:segRoot[k]})),
            }
        }
    }

    module.exports = exports.ImportHtml = ImportHtml;
})(typeof exports === "object" ? exports : (exports = {}));

