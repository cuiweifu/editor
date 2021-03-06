﻿/*jshint·esversion:·6·*/
var editor;
var stdin;
var stdout;
var confirmer;
var xhr;
var prog;

var codeHash;

var debug = {
    "name": "Debug API",
    "hostname": "debug.opencompiler.net",
    "url": "https://en.wikipedia.org/wiki/Private_network",
    "score": 0
};

var beta = {
    "name": "OpenCompiler(beta)",
    "hostname": "api.opencompiler.net",
    "url": "https://github.com/OpenCompiler/",
    "score": 0
};


var servers_url = "https://api.opencompiler.net/servers";

var languages = {
    "C++15": {
        "mode": "ace/mode/c_cpp",
        "identifier": "cpp15",
        "code": "#include <bits/stdc++.h>\n\nusing namespace std;\n\nint main(){\n\t//cout << \"Hello,World\" << endl;\n\t\n\treturn 0;\n}",
        "prefix": "/run/gcc/latest"
    }
};



var servers = [];

function latest(obj){
    var arr = Object.keys(obj);
    if(arr.length === 0){
        return undefined;
    }
    return obj[arr.sort(function(a,b){
        return parseInt(a) > parseInt(b);
    })[0]];
}

function parse_response(str){
    var ret = {'stdout':'', 'stderr': '', 'stdoe': ''};
    for(var line of str.split("\n")){
        var sp = line.split(":");
        var opt = sp[0];
        var s = sp.slice(1).join(":");
        if(ret[opt] === undefined){
            ret[opt] = "";
        }
        if(opt === "stdout" || opt === "stderr") ret.stdoe += s + "\n";
        ret[opt] += s + "\n";
    }
    return ret;
}

function syntax_check(str){
    // count pair of characters
    var diff_brackets = 0;
    var diff_parentheses = 0;
    var diff_braces = 0;
    for(var s in str){
        var c = str[s];
        switch(c){
            case "(":
                diff_parentheses++;
                break;
            case ")":
                if(diff_parentheses <= 0){
                    return false;
                }
                diff_parentheses--;
                break;
            case "[":
                diff_brackets++;
                break;
            case "]":
                if(diff_brackets <= 0){
                    return false;
                }
                diff_brackets--;
                break;
            case "{":
                diff_braces++;
                break;
            case "}":
                if(diff_braces <= 0){
                    return false;
                }
                diff_braces--;
                break;
        }
    }
    if(diff_brackets || diff_parentheses || diff_braces){
        return false;
    }
    return true;
}

function progress(){
    if(xhr === undefined){
        prog = undefined;
        return;
    }
    if(parseInt(document.getElementById("progressbar").style.width) >= 90){
        prog = undefined;
        return;
    }
    document.getElementById("progressbar").style.width = String(parseInt(document.getElementById("progressbar").style.width) + 10) + "%";
    prog = setTimeout(progress, 1000);
}

function error_parser(s,lang){
    if(lang[0] == "c"){
        console.log(s);
        annotations = [];
        for(var line of s.split("\n")) {
            result = line.match(/main.[a-zA-Z]{1,3}:(\d*):(\d*):([a-zA-Z: '";]*)/);
            console.log(result);
            if(result !== undefined && result !== null && result.length >= 3){
                annotations.push({
                    row: parseInt(result[1]-1),
                    column: parseInt(result[2]),
                    text: result[3],
                    type: "error"
                });
            }
        }
        editor.getSession().setAnnotations(annotations);
    }
    if(lang == "golang"){
        annotations = [];
        for(var line of s.split("\n")) {
            result = line.match(/.\/main.[a-zA-Z]{1,3}:(\d*):(\d*):(.*)/);
            console.log(result);
            if(result !== undefined && result !== null && result.length >= 3){
                annotations.push({
                    row: parseInt(result[1]-1),
                    column: parseInt(result[2]),
                    text: result[3],
                    type: "error"
                });
            }
        }
        editor.getSession().setAnnotations(annotations);
    }

}

function run(lang, code, explicit, callback){
    if(xhr) return;
    if(callback === undefined) callback = function(){};
    if(explicit){
        document.getElementById("warning-tag").classList.add('hidden');
        document.getElementById("run").classList.add("running");
        document.getElementById("progressbar").style.width = "0%";
        document.getElementById("progressbar").style.opacity = "1.0";
        document.getElementById("server-tag").classList.remove("hidden");
        document.querySelector("#server-tag > .text").innerText = servers[0].name;
        editor.getSession().setAnnotations([]);
    }
    xhr = new XMLHttpRequest();
    if(prog === undefined) prog = setTimeout(progress(),0);
    var prefix = lang.prefix;
    xhr.open("POST", "//" + servers[0].hostname + prefix, true);
    xhr.onprogress = function () {
        console.log("PROGRESS:", xhr.responseText);
        var resp = parse_response(xhr.responseText);
        console.log(resp);
        console.log(lang.identifier);
        if(resp["g++"]){
            stdout.setValue(resp["g++"]);
            error_parser(resp["g++"],lang.identifier);
        } else if(resp.gcc){
            stdout.setValue(resp.gcc);
            error_parser(resp.gcc,lang.identifier);
        } else if(resp.go){
            stdout.setValue(resp.go);
        } else if(resp.rustc){
            stdout.setValue(resp.rustc);
        } else {
            stdout.setValue(resp.stdoe);
        }
    };
    xhr.timeout = 5000;
    xhr.ontimeout = function(){
        return run(lang, code, explicit, callback);
    }
    xhr.setRequestHeader( 'Content-Type', 'application/x-www-form-urlencoded' );
    xhr.onreadystatechange = function(e) {
        console.log(xhr.readyState);
        if (xhr.readyState === 4) {
            if (explicit){
                document.getElementById("run").classList.remove('running');
                if (xhr.status >= 200 && xhr.status < 300) {
                    document.getElementById("progressbar").style.width = "100%";
                    document.getElementById("progressbar").style.opacity = "0.0";
                    callback(lang.identifier, code, callback);
                } else if(xhr.status == 0) {
                    document.getElementById("warning-tag").classList.remove('hidden');
                    document.getElementById("warning-tag").innerText = "Server response not received.";
                    document.getElementById("progressbar").style.opacity = "0.0";
                } else {
                    document.getElementById("warning-tag").classList.remove('hidden');
                    document.getElementById("warning-tag").innerText = xhr.responseText;
                }
            }
            xhr = undefined;
        }
    };
    xhr.send(JSON.stringify({language: lang.identifier, code: code, stdin: stdin.getValue()}));
}

function waitforready(callback){
    if(location.hostname === "www.opencompiler.net"){
        var xhr = new XMLHttpRequest();
        xhr.open("GET", servers_url, true);
        xhr.send(null);
        xhr.onreadystatechange = function(){
            if( xhr.readyState === 4 && xhr.status === 200 ){
                servers = JSON.parse(xhr.responseText);
                servers.sort(function(a,b){
                    if(a.score > b.score) return -1;
                    if(a.score < b.score) return 1;
                    return 0;
                });
                callback();
            }
        };
    } else if(location.hostname === "beta.opencompiler.net"){
        servers = [beta];
        document.getElementById("beta-tag").classList.remove('hidden');
        callback();
    } else {
        servers = [debug];
        callback();
    }
}

window.onload = function(){
    codeHash = moment().unix();
    stdin = ace.edit("stdin");
    stdin.setTheme("ace/theme/monokai");
    stdin.setShowPrintMargin(false);
    stdout = ace.edit("stdout");
    stdout.setReadOnly(true);
    stdout.setTheme("ace/theme/monokai");
    stdout.setShowPrintMargin(false);
    stdout.setOption("wrap", true);
    editor = ace.edit("editor");
    editor.setValue("#include <bits/stdc++.h>\n\nusing namespace std;\n\nint main(){\n\t//cout << \"Hello,World!\" << endl;\n\t\n\t\n\treturn 0;\n}");
    editor.setTheme("ace/theme/monokai");
    editor.getSession().setMode("ace/mode/c_cpp");
    editor.getSession().setUseSoftTabs(false);
    editor.navigateLineEnd();
    editor.setShowInvisibles(true);
    editor.setShowPrintMargin(false);
    editor.setOptions({
        fontFamily:'Monaco, Menlo, Ubuntu Mono, Consolas, source-code-pro, monospace',
        fontSize: "20px",
        enableBasicAutocompletion: false,
        enableSnippets: true,
        enableLiveAutocompletion: true
    });
    editor.$blockScrolling = Infinity;
    editor.navigateTo(5,1);
    confirmer = ace.edit("confirmer");
    confirmer.setTheme("ace/theme/monokai");
    confirmer.getSession().setMode("ace/mode/c_cpp");
    confirmer.getSession().setUseSoftTabs(false);
    confirmer.setShowInvisibles(true);
    confirmer.setShowPrintMargin(false);
    confirmer.setReadOnly(true);
    confirmer.setHighlightActiveLine(false);
    confirmer.setOptions({
        fontFamily:'Monaco, Menlo, Ubuntu Mono, Consolas, source-code-pro, monospace',
        fontSize: "12px",
    });

    var func_run = function(explicit, callback){
        var lang = document.getElementById("language-select").options[document.getElementById("language-select").selectedIndex].text;
        console.log(lang);
        console.log(languages);
        run(
            languages[lang],
            editor.getValue(),
            explicit,
            callback
        );
    };
    /*editor.commands.addCommand({
        name: 'Run',
        bindKey: {win: 'Ctrl-R', mac: 'Command-R'},
        exec: function(edtior){
            func_run(function(){

            });
        }
    });*/
    document.onkeydown = function(e){
      if((e.ctrlKey || e.metaKey) && e.which == 82){//Ctrl + R
        e.preventDefault();
        func_run(true, function(){
        });
      }
    };
    var precompile_timer;
    editor.on('change', function(){
        var lang = document.getElementById("language-select").options[document.getElementById("language-select").selectedIndex].text;
        languages[lang].code = editor.getValue();
        document.getElementById("build-tag").classList.add('hidden');
        document.getElementById("modify-tag").classList.remove('hidden');
        if(('localStorage' in window) && (window.localStorage !== null)){
            var history = JSON.parse(localStorage.getItem("history"));
            if(history === null || history === undefined){
                history = {};
            }
            var lang_name = document.getElementById("language-select").options[document.getElementById("language-select").selectedIndex].text;
            var cont = {
                'date': moment(),
                'code': editor.getValue(),
                'stdin': stdin.getValue(),
                'language': lang_name
            };
            history[codeHash] = cont;
            localStorage.setItem('history', JSON.stringify(history));
        }
        function pre_compile (){
            var code = editor.getValue();
            console.log("Syntax check:", syntax_check(code));
            /*if(syntax_check(code)){
                func_run();
            }*/
        }
        if(precompile_timer) clearTimeout(precompile_timer);
        precompile_timer = setTimeout(pre_compile, 5000);
    });
    stdin.on('focus', function(){
        document.body.scrollTop = document.body.scrollHeight;
    });
    stdin.on('change', function(){
        if(('localStorage' in window) && (window.localStorage !== null)){
            var history = JSON.parse(localStorage.getItem("history"));
            if(history === null || history === undefined){
                history = {};
            }
            var lang_name = document.getElementById("language-select").options[document.getElementById("language-select").selectedIndex].text;
            var cont = {
                'date': moment(),
                'code': editor.getValue(),
                'stdin': stdin.getValue(),
                'language': lang_name
            };
            history[codeHash] = cont;
            localStorage.setItem('history', JSON.stringify(history));
        }
    });
    stdin.on('input',function(){
        var shouldShow = !stdin.session.getValue().length;
        var node = stdin.renderer.emptyMessageNode;
        if (!shouldShow && node) {
            stdin.renderer.scroller.removeChild(stdin.renderer.emptyMessageNode);
            stdin.renderer.emptyMessageNode = null;
        } else if (shouldShow && !node) {
            node = stdin.renderer.emptyMessageNode = document.createElement("div");
            node.textContent = "Standard Input";
            node.className = "ace_invisible ace_emptyMessage";
            node.style.padding = "0 6px";
            stdin.renderer.scroller.appendChild(node);
        }
    });
    stdin._eventRegistry.input[0]();
    tippy('#stdout', {
        content: document.getElementById('tip')
    });
    stdout.on('focus', function(){
        document.body.scrollTop = document.body.scrollHeight;
    });
    stdout.on('input',function(){
        var shouldShow = !stdout.session.getValue().length;
        var node = stdout.renderer.emptyMessageNode;
        if (!shouldShow && node) {
            stdout.renderer.scroller.removeChild(stdout.renderer.emptyMessageNode);
            stdout.renderer.emptyMessageNode = null;
        } else if (shouldShow && !node) {
            node = stdout.renderer.emptyMessageNode = document.createElement("div");
            node.textContent = "Standard Output";
            node.className = "ace_invisible ace_emptyMessage";
            node.style.padding = "0 9px";
            stdout.renderer.scroller.appendChild(node);
        }
    });
    stdout._eventRegistry.input[0]();


    //Load languages map
    if (location.hostname === "www.opencompiler.net" || location.hostname === "debug.opencompiler.net" ){
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "languages.json", true);
        xhr.send(null);
        xhr.onreadystatechange = function(){
            if( xhr.readyState === 4 && xhr.status === 200 ){
                languages = JSON.parse(xhr.responseText);
                for(var i in languages){
                    var option = document.createElement("option");
                    option.text = i;
                    option.value = i;
                    document.getElementsByTagName("select")[0].appendChild(option);
                }
                waitforready(function(){
                    document.getElementById("loading").style.opacity = "0";
                    setTimeout(function(){
                        document.getElementById("loading").style.display = "none";
                    },2000);
                });
            }
        }
    } else {
        console.log(languages);
        for(var i in languages){
            console.log(i);
            var option = document.createElement("option");
            option.text = i;
            option.value = i;
            document.getElementsByTagName("select")[0].appendChild(option);
        }
        setTimeout(function(){
            waitforready(function(){
                document.getElementById("loading").style.opacity = "0";
                setTimeout(function(){
                    document.getElementById("loading").style.display = "none";
                },2000);
            });
        },1000);
    }

    var moving = false;
    document.body.onmouseup = function(event){
        moving = false;
    };
    document.getElementById("separator").onmousedown = function(event){
        moving = true;
    };
    document.body.onmousemove = function(event){
        if(moving){
            document.getElementById("editor").style.width = "calc(" + event.clientX + "px - 1.5px)";
            document.getElementById("stdio").style.width = "calc(100% - " + event.clientX + "px - 1.5px)";
        }
    };

    document.getElementById("language-select").onchange = function(event){
        var lang = document.getElementById("language-select").options[document.getElementById("language-select").selectedIndex].text;
        console.log(lang);
        editor.getSession().setMode(languages[lang].mode);
        editor.setValue(languages[lang].code);
    };

    /*document.getElementById("auto-test").onclick = function(event){
        var url = window.prompt("問題文のURL","");
        if(url){
            var host = url.split("/")[2];
            if(/(\d+).atcoder\.jp/.test(host)){
                console.log(host);
            }
        }
    };*/

    document.getElementById("run").onclick = function(event){
        if(document.getElementById("run").classList.contains("running")) {
            document.getElementById("run").classList.remove("running");
        } else {
            func_run(true, function(){

            });
        }
    };

    document.getElementById("beta-tag").classList.add("hidden");
    document.getElementById("modify-tag").classList.add("hidden");
    document.getElementById("build-tag").classList.add("hidden");
    document.getElementById("warning-tag").classList.add("hidden");
    document.getElementById("server-tag").classList.add("hidden");
    document.getElementById("server-tag").onclick = function(){
        if(servers[0].url) window.open(servers[0].url);
    }.bind(last_session);

    if(('localStorage' in window) && (window.localStorage !== null) && localStorage.getItem('history') !== null){
        var last_session = latest(JSON.parse(localStorage.getItem('history')));
        if(last_session !== undefined){
            var edit_date = moment(last_session.date);
            document.querySelector("#last-session-tag > .text").innerText = edit_date.format('LLL');
            document.getElementById("last-session-tag").onclick = function(){
                document.getElementById("modal-wrap").style.opacity = "1.0";
                document.getElementById("modal-wrap").classList.remove("hidden");
                document.querySelector("#confirmer-language-tag > .text").innerText = this.language;
                document.querySelector("#confirmer-date-tag > .text").innerText = moment(this.date).format('LLL');
                confirmer.setValue(this.code);
            }.bind(last_session);
    
            document.getElementById("btn-cancel").onclick = function(){
                document.getElementById("modal-wrap").style.opacity = "0";
                setTimeout(function(){
                    document.getElementById("modal-wrap").classList.add("hidden");
                },1000);
            };
    
            document.getElementById("btn-recover").onclick = function(){
                codeHash = moment().unix();
                document.getElementById("modal-wrap").style.opacity = "0";
                setTimeout(function(){
                    document.getElementById("modal-wrap").classList.add("hidden");
                    editor.setValue(confirmer.getValue());
                    stdin.setValue(this.stdin);
                }.bind(this),1000);
            }.bind(last_session);
        }
    } else {
        document.getElementById("last-session-tag").classList.add("hidden");
    }
    if(('localStorage' in window) && (window.localStorage !== null) && localStorage.getItem('user') !== null){
        user = JSON.parse(localStorage.getItem('user'));
        console.log(user.email);
        LogRocket.identify(user.id, {
          name: user.id,
          email: user.email,
        });
    }
    setTimeout(function(){
      func_run(false, function(){});
    },1000);
};

window.addEventListener('beforeunload', function(e) {
    e.returnValue = 'ソースコードは保存されません。このページを離れてもいいですか？';
}, false);
