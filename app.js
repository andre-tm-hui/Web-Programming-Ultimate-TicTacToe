//  OpenShift sample Node application
var express = require('express'),
    app     = express(),
	fs		= require('fs');

const uuid = require('uuid/v4');

var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: false }));

var searching = {}; // {name: index} searching.keys().length
var games = {};
var invites = {};

var people = JSON.parse(fs.readFileSync('./people.json', 'utf8'));

var validTokens = ["concertina"];

var messagelist = [["", "", "0"]];

var check = JSON.parse(fs.readFileSync('./check.json', 'utf8'));

var gameTemplate = JSON.parse(fs.readFileSync('./game.json', 'utf8'));;


function findPlayer(usr) {
    for (i = 0; i < people.length; i++) {
        if (people[i].username == usr) {
            return i;
        };
    };
    return 0;
};

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/client/index.html');
});

app.use('/client', express.static(__dirname + '/client'));

app.get('/people', function (req, res) {
    var on = { "online": [] };
    if (req.query.filter == "online") {
        for (i = 0; i < people.length; i++) {
            p = people[i];
            if (p.status != "offline" && p.status != "away") {
                on.online.push(p["username"]);
            };
        };
        res.send(on);
    } else {
        res.send(people);
    };
});

app.post('/people', function (req, res) {
    var registered = false;
    for (i = 0; i < people.length; i++) {
        if (people[i].username == req.body.username) {
            registered = true;
        };
    };

    if (validTokens.includes(req.body.access_token)){
        if (!registered) {
            var newPerson = {
                "username": req.body.username,
                "password": req.body.password,
                "forename": req.body.forename,
                "surname": req.body.surname,
                "access_token": "",
                "stats": { "wins": 0, "played": 0 },
                "status": "offline",
                "game": { "id": "", "symbol": "" },
                "timeout": 0
            };
            people.push(newPerson);
            res.send({ "registered": "true" });
            fs.writeFileSync('people.json', JSON.stringify(people), 'utf8');
        } else {
            res.sendStatus(400);
        };
    } else {
        res.sendStatus(403);
    };
});

app.get('/people/:username', function (req, res) {
    const username = req.params.username;
    var user;
    var found = false;

    for (i = 0; i < people.length; i++) {
        p = people[i];
        if (p.username == username) {
            user = i;
            found = true;
        };
    };


    if (!found) {
        res.sendStatus(404);
    } else {
        if (req.query.function == "login") {
            if (people[user].password == req.query.password) {

                const token = uuid().toString();
                people[user].access_token = token;
                validTokens.push(token);

                people[user].status = "standby";
                people[user].online = "true";
                res.send({ "access_token": token, "logon": "true" });
            } else {
                res.send({ "logon": "false" });
            };

        } else if (req.query.function == "stats") {
            res.send(people[user].stats);
        } else if (req.query.function == "status") {
            res.send({ "status": people[user].status});
            people[user].timeout = 0;
        } else if (req.query.function == "gameinfo") {
            res.send(people[user].game);
        } else {
            res.send(people[user]);
        };
    };
});

app.post('/people/:username', function (req, res) {
    const username = req.params.username;
    var userindex;

    for (i = 0; i < people.length; i++) {
        p = people[i];
        if (p.username == username) {
            userindex = i;
        };
    };

    if (validTokens.includes(req.body.access_token)) {
        people[userindex].timeout = 0;
        people[userindex].status = req.body.status;
        if (req.body.status == "standby" && games[people[userindex].game.id] != "") {
            delete games[people[userindex].game.id];
            people[userindex].game = { "id": "", "symbol": "" };
        } else if (req.body.status == "offline") {
            validTokens.splice(validTokens.indexOf(people[userindex]["access_token"]), 1);
            people[userindex].access_token = "";
        } else if (req.body.status == "searching" || req.body.status == "ready") {
            matchmaker();
        };
        res.send({ "status": "updated" });

    } else {
        res.sendStatus(403);
    };
});

function matchmaker() {
    for (i = 0; i < people.length; i++) {
        var p = people[i];
        if (p.status == "searching" && !Object.keys(searching).includes(p["username"])) {
            searching[p["username"]] = i;
        } else if (p.status != "searching" && Object.keys(searching).includes(p["username"])) {
            delete searching[p["username"]];
        };
    };
    if (Object.keys(searching).length >= 2) {
        var gid = Math.random().toString();
        var symbols = ["O", "X"];
        games[gid] = JSON.parse(JSON.stringify(gameTemplate));

        for (i = 0; i < 2; i++) {
            people[Object.values(searching)[i]].game.id = gid;
            people[Object.values(searching)[i]].game.symbol = symbols[i];
            people[Object.values(searching)[i]].status = "gamefound";
            games[gid].players[symbols[i]] = Object.keys(searching)[i];
        };
        delete searching[Object.keys(searching)[0]];
        delete searching[Object.keys(searching)[0]];

    };

    for (var key in games) {
        var p1 = games[key].players.O;
        var p2 = games[key].players.X;
        if (people[findPlayer(p1)].status == "ready" && people[findPlayer(p2)].status == "ready") {
            people[findPlayer(p1)].status = "turn";
            people[findPlayer(p2)].status = "wait";
        };
    };
};

function timeoutCheck() {
    for(i = 0; i < people.length; i++){
        people[i].timeout += 60000;
        if(people[i].status != "offline" && people[i].timeout > 300000){
            if(people[i].timeout > 1800000){
                console.log(people[i]);
                people[i].status == "offline";
                const auth = people[i].access_token;
                if(auth != "concertina" && auth != ""){
                    validTokens.splice(validTokens.indexOf(auth),1);
                };
                people[i].access_token = "";
            } else {
                people[i].status = "away";
            };
        };
    };
};


setInterval(timeoutCheck, 60000);


app.get('/games/:gid', function (req, res) {
    const gid = req.params.gid;
    const f = req.query.function;

    if(games[gid]){
        if (f == "load") {
            res.send(games[gid].players);
        } else if (f == "update") {
            res.send([games[gid].board.lastmove, games[gid].board.playableS]);
        };
    } else {
        res.sendStatus(404);
    };
});

app.post('/games/:gid', function (req, res) {
    const game = games[req.params.gid];

    const symbol = req.body.symbol;
    const s = req.body.s;
    const p = req.body.p;

    if (validTokens.includes(req.body.access_token)) {
        if (req.body.function == "forfeit") {

            var loser = findPlayer(game.players[symbol]);
            var winner;
            if (symbol == "O"){
                winner = findPlayer(game.players.X);
            } else {
                winner = findPlayer(game.players.O);
            };
            people[loser].status = "loss";
            people[loser].stats.played++;
            people[winner].status = "win";
            people[winner].stats.played++;
            people[winner].stats.wins++;

            res.send({});

        } else {
            if (game["board"]["playableS"].includes(req.body["s"])) {
                playable = "true";

                updateBoard(req.params["gid"], s, p, symbol);

                if (game.board.win == "") {
                    var p1 = findPlayer(game.players.O);
                    var p2 = findPlayer(game.players.X);
                    if (symbol == "O") {
                        people[p1].status = 'wait';
                        people[p2].status = 'turn';
                    } else if (symbol == "X") {
                        people[p2].status = 'wait';
                        people[p1].status = 'turn';
                    };
                };
            } else {
                playable = "false";
            };
            res.send({ "playable": playable });
        };
    } else {
            res.sendStatus(403);
    };
});

function updateBoard(gid, s, p, sym) {
    const game = games[gid];
    var filled = true;
    game.board.playableS = [];
    game.board[s][p] = sym;

    for (k in check[p]) {
        l = check[p][k];
        if (game.board[s][k] == sym && game.board[s][l] == sym) {
            game.board[s].win = sym;
        };
    };

    for (i = 1; i < 10; i++){
		if (game.board[s][i.toString()] == "") {
			filled = false;
		};
    };
    
	if (filled) {
		game.board[s].win = "none";
    };
    
    if (game.board[s].win != "" && game.board[s].win != "none"){
        game.board.lastmove.win = "true";
    } else {
        game.board.lastmove.win = "";
    };

    if (game.board[p].win != "") {
        for (i = 1; i < 10; i++) {
            if (game.board[i.toString()].win == "") {
                game.board.playableS.push(i.toString());
            };
        };
    } else {
        game.board.playableS.push(p);
    };

    game.board.lastmove.symbol = sym;
    game.board.lastmove.move = s + p;

    if (game.board[s].win == sym) {
        for (k in check[s]) {
            l = check[s][k];
            if (game.board[k].win == sym && game.board[l].win == sym) {
                game.board.win = sym;
            };
        };
    };

    var p1 = findPlayer(game.players.O);
    var p2 = findPlayer(game.players.X);
    var winner;
    var loser;
    if (game.board.win != ""){
        if (game.board.win == "O") {
            winner = p1;
            loser = p2;
        } else if (game.board.win == "X") {
            winner = p2;
            loser = p1;
        };
        people[winner].stats.wins++;
        people[winner].stats.played++;
        people[winner].status = "win";
        people[loser].stats.played++;
        people[loser].status = "loss";
    } else if (game.board.playableS.length == 0) {
        game.board.win = "draw";
        people[p1].stats.played++;
        people[p1].status = "draw";
        people[p2].stats.played++;
        people[p2].status = "draw";
	};
};


app.get('/chat', function (req, res) {
    chat = '';
    for (i = 0; i < 15; i++) {
        if (messagelist[i]) {
            chat += '<div class=\'chat' + messagelist[i][2] + '\' style=\'background-color=#808080\'><small>' + messagelist[i][0] + '</small><div>' + messagelist[i][1] + '</div></div>';
        };
    };
    res.send(chat);
});

app.post('/chat', function (req, res) {
    var col;
    if (messagelist[messagelist.length - 1][2] == 0) {
        col = 1;
    } else {
        col = 0;
    }

    if (validTokens.includes(req.body["access_token"])) {
        messagelist.push([req.body.username, req.body.message, col]);
        if (messagelist.length > 15) {
            messagelist.shift();
        }
        res.send({ "posted": "true" });
    } else {
        res.sendStatus(403);
    };
});

app.post('/invite', function (req, res) {
    if (req.body.cancel == "true") {
        for (var key in invites) {
            if (invites[key].includes(req.body.inviter)) {
                invites[key].splice(invites[key].indexOf(req.body.inviter), 1);
            };
        };
    };
    res.send({});
});

app.get('/invite/:invited', function (req, res) {
    const invited = req.params.invited;
    if (!invites[invited]) {
        invites[invited] = [];
    };
    res.send(invites[invited]);
});

app.post('/invite/:invited', function (req, res) {
    const invited = req.params.invited;

    if (validTokens.includes(req.body.access_token)) {
        if (req.body.function == "invite") {
            const inviter = req.body.inviter;
            var success = "true";

            for (var key in invites) {
                if (invites[key].includes(inviter)) {
                    success = "false";
                };
            };
            if (success == "true") {
                if (invites[invited]) {
                    invites[invited].push(inviter);
                } else {
                    invites[invited] = [inviter];
                };
            };

            people[findPlayer(inviter)].status = "inviter";

            res.send({ "invited": success });

        } else {
            if (req.body.function == "accept") {
                var inviter = invites[invited][0];
                var players = [findPlayer(inviter), findPlayer(invited)];
                var playernames = [inviter, invited]
                var gid = Math.random().toString();
                var symbols = ["O", "X"];
                games[gid] = JSON.parse(JSON.stringify(gameTemplate));

                for (i = 0; i < 2; i++) {
                    people[players[i]].game.id = gid;
                    people[players[i]].game.symbol = symbols[i];
                    people[players[i]].status = "gamefound";
                    games[gid].players[symbols[i]] = playernames[i];
                };
            } else {
                people[findPlayer(invites[invited][0])].status = "standby";
            };

            invites[invited].splice(0,1);
            res.send({});
        };
    } else {
        res.sendStatus(403);
    };
});

app.get('/invite/:invited', function (req, res) {
    const invited = req.params.invited;
    res.send(invites[invited]);
});

app.post('/dc', function (req, res) {
    if (online[req.body.pid]) {
        delete online[req.body.pid];
    };
});




console.log('Server running on http://127.0.0.1:8080');

module.exports = app ;
