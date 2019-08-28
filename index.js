const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio')
const qs = require('qs');
const moment = require('moment');

const URL_PROD = "https://www.sig.unb.br/";
const URL_DESENV = "https://sig.desenv.unb.br/";
const URL_HOMOLOGA = "https://sig.homologa.unb.br/";


var trace = 1;
var debug = 0;

let dataHoje
let dados = {
    usr: '',
    pass: '',
}

const agent = new https.Agent({
    rejectUnauthorized: false
});

var instance = null;

function configurarExecucao() {
    function getArgs() {
        const args = {};
        process.argv
            .slice(2, process.argv.length)
            .forEach(arg => {
                // long arg
                if (arg.slice(0, 2) === '--') {
                    const longArg = arg.split('=');
                    const longArgFlag = longArg[0].slice(2, longArg[0].length);
                    const longArgValue = longArg.length > 1 ? longArg[1] : true;
                    args[longArgFlag] = longArgValue;
                }
                // flags
                else if (arg[0] === '-') {
                    const flags = arg.slice(1, arg.length).split('');
                    flags.forEach(flag => {
                        args[flag] = true;
                    });
                }
            });
        return args;
    }
    const args = getArgs();
    console.log(args);
    let argKeys = Object.keys(args)
    let ambienteSetado = false;
    let loginSetado = false;
    let senhaSetada = false;
    argKeys.forEach(key => {
        switch (key) {
            case 'prod':
                instance = axios.create({
                    baseURL: URL_PROD,
                });
                console.log('Rodando o pontão em PRODUÇÂO');
                ambienteSetado = true;
                break;
            case 'homologa':
                instance = axios.create({
                    baseURL: URL_HOMOLOGA,
                });
                console.log('Rodando o pontão em HOMOLOGAÇÂO');
                ambienteSetado = true;
                break;
            case 'desenv':
                instance = axios.create({
                    baseURL: URL_DESENV,
                });
                console.log('Rodando o pontão em DESENVOLVIMENTO');
                ambienteSetado = true;
                break;
            case 'debug':
                debug = 1;
                console.log('Modo DEBUG Ligado')
                break;
            case 'login':
                dados.usr = args['login'];
                loginSetado = true;
                break;
            case 'senha':
                dados.pass = args['senha'];
                senhaSetada = true;
                break;
        }
    });

    if(!loginSetado || !senhaSetada){
        console.log('[[[Login ou senha faltando. Execute o programa com os argumentos --login=seu_login --senha=sua_senha]]]');
        return false;
    }

    if(!ambienteSetado){
        instance = axios.create({
            baseURL: URL_HOMOLOGA,
        });
        console.log('Ambiente não especificado rodando o pontão em HOMOLOGA');
    }
    return true;
}

function isHorarioAlmoco() {
    let eleven = moment('11:00', 'HH:mm')
    let three = moment('15:00', 'HH:mm')
    let now = moment();
    return (now.isAfter(eleven) && now.isBefore(three))
}

function somarUmViewState(vs) {
    return vs.substr(0, vs.length - 1) + (parseInt(vs[vs.length - 1]) + 1)
}

function realizarLogoff(cookie) {
    let urlLogoff = 'sigrh/LogOff'
    instance.get(urlLogoff, cookie).then(
        saida => {
            if (trace) { console.log('Logoff realizado') }
        }
    )
}

function buscarHorarios($contexto) {
    let arrayHorarios = []
    let horariosSemana = $contexto('form[name="formHorariosSemana"]').find('span')
    for (let i = 0; i < horariosSemana.length; i++) {
        const horario = horariosSemana[i];
        if (horario && horario.firstChild) {
            arrayHorarios.push(horario.firstChild.data)
        }
    }
    return arrayHorarios
}

function buscarHorarioDeSaidaProvavel($contexto) {
    let span = $contexto('#idFormDadosEntradaSaida\\:horaSaidaPrevista')
    if (span && span.length > 0) {
        return span[0].firstChild.data.slice(0, 5)
    }
}

function buscarTempoRegistrado($contexto) {
    let tds = $contexto('tfoot>tr>td')
    if (tds && tds.length > 5) {
        return tds[2].firstChild.data
    }
}

function somarTempo(base, soma) {
    let horas = soma.slice(0, 2)
    let minutos = soma.slice(3, 5)
    base.add(horas, 'hours')
    base.add(minutos, 'minutes')
    return base;
}

function subtrairTempo(base, sub) {
    let horas = sub.slice(0, 2)
    let minutos = sub.slice(3, 5)
    base.subtract(horas, 'hours')
    base.subtract(minutos, 'minutes')
    return base;
}

function horaMinimaSaida(entrada, registradas, regime) {
    let totalSubtraido = subtrairTempo(moment(regime, 'HH:mm'), registradas)
    let horaEntrada = somarTempo(moment(entrada, 'HH:mm'), totalSubtraido.format('HH:mm'))
    return horaEntrada.format('HH:mm')
}

function realizarEntrada(viewState, conf) {
    let url = 'sigrh/frequencia/ponto_eletronico/cadastro_ponto_eletronico.jsf'
    let bodyEntrada = new Object();
    bodyEntrada['idFormDadosEntradaSaida'] = 'idFormDadosEntradaSaida'
    bodyEntrada['idFormDadosEntradaSaida:observacoes'] = ''
    bodyEntrada['idFormDadosEntradaSaida:idBtnRegistrarEntrada'] = 'Registrar Entrada'
    bodyEntrada['javax.faces.ViewState'] = viewState
    instance.post(url, qs.stringify(bodyEntrada), conf).then(
        entrada => {
            const $entrada = cheerio.load(entrada.data)
            let arrayHorarios = buscarHorarios($entrada)
            let tempoRegistrado = buscarTempoRegistrado($entrada)
            let horaEntrada = arrayHorarios[arrayHorarios.length - 1];
            let regime = ['06:00', '8:45'];
            if (trace) { console.log('[[[Entrada Realizada]]], horario: ' + horaEntrada) }
            if (trace) { console.log('[[[Horas Registradas]]] ' + tempoRegistrado) }
            if (trace) { console.log('[[[Horário mínimo de saída]]] ' + horaMinimaSaida(horaEntrada, tempoRegistrado, regime[1])) }
            realizarLogoff(conf)
        }
    )
}

function realizarSaida(viewState, conf) {
    let url = 'sigrh/frequencia/ponto_eletronico/cadastro_ponto_eletronico.jsf'
    let bodySaida = new Object();
    bodySaida['idFormDadosEntradaSaida'] = 'idFormDadosEntradaSaida'
    bodySaida['idFormDadosEntradaSaida:observacoes'] = ''
    if (isHorarioAlmoco()) {
        if (trace) { console.log('[[[Realizando Saída Para Horário de Almoço]]]') }
        bodySaida['idFormDadosEntradaSaida:saidaAlmoco'] = 'true'
    } else {
        bodySaida['idFormDadosEntradaSaida:saidaAlmoco'] = 'false'
    }
    bodySaida['idFormDadosEntradaSaida:idBtnRegistrarSaida'] = 'Registrar Saída'
    bodySaida['javax.faces.ViewState'] = viewState

    instance.post(url, qs.stringify(bodySaida), conf).then(
        saida => {
            const $saida = cheerio.load(saida.data)
            let arrayHorarios = buscarHorarios($saida)
            let tempoRegistrado = buscarTempoRegistrado($saida)
            if (trace) { console.log('[[[Saída Realizada]]], Horário: ' + arrayHorarios[arrayHorarios.length - 1]) }
            if (trace) { console.log('[[[Horas Registradas]]] ' + tempoRegistrado) }
            realizarLogoff(conf)
        }
    )
}

function navegarParaPonto(viewState, conf) {
    let bodyNavegar = new Object();
    bodyNavegar['painelAcessoDadosServidor'] = 'painelAcessoDadosServidor'
    bodyNavegar['javax.faces.ViewState'] = viewState
    bodyNavegar['painelAcessoDadosServidor:linkPontoEletronicoAntigo'] = 'painelAcessoDadosServidor:linkPontoEletronicoAntigo'
    instance.post('/sigrh/servidor/portal/servidor.jsf', qs.stringify(bodyNavegar), conf).then(
        paginaPonto => {
            if (debug) { console.log(paginaPonto.headers) }
            if (debug) { console.log(paginaPonto.config) }

            if (paginaPonto.data.indexOf('autenticar-se novamente') != -1) {
                if (trace) { console.log('[[[Sessão Expirada ao navegar para o ponto, Realizando o Logoff e Tentando Novamente]]]') }
                realizarLogoff(conf)
                pontao()
                return;
            }

            const $paginaPonto = cheerio.load(paginaPonto.data)
            let viewStatePonto = $paginaPonto('[name="javax.faces.ViewState"]').attr('value')
            if ($paginaPonto('[name="idFormDadosEntradaSaida:idBtnRegistrarSaida"]').length > 0) {
                if (trace) { console.log('[[[Página de Saída]]]') }
                realizarSaida(viewStatePonto, conf)
            } else if ($paginaPonto('[name="idFormDadosEntradaSaida:idBtnRegistrarEntrada"]').length > 0) {
                if (trace) { console.log('[[[Página de Entrada]]]') }
                realizarEntrada(viewStatePonto, conf)
            }
        }
    )
}

pontao()



function pontao() {
    // configurar o app com a linha de comando, se falhar retorna
    if(!configurarExecucao()){
        console.log('Configuracao incorreta, parametros possiveis: --debug, --homologa, --desenv, --prod, --login, --senha');
        return;
    }

    // get para pegar a página de login do sistem
    instance.get('sigrh/login.jsf', { withCredentials: true, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 5.0; SM-G900P Build/LRX21T) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.108 Mobile Safari/537.36' } }).then(
        res => {
            if (trace) { console.log('[[[Página de Login Recebida]]]') }
            if (debug) { console.log(res.headers) }
            const $ = cheerio.load(res.data)
            let loginField = $('#login')
            let pasField = $('#senha')
            let viewState = $('[name="javax.faces.ViewState"]').attr('value')
            let sessionId = res.headers['set-cookie'][0].split(';')[0]

            // Monta o cookie para a requisicao
            let config = {}
            config.headers = {}
            config.headers.Cookie = sessionId
            config.headers.Connection = 'keep-alive'
            config.withCredentials = 'true'
            config.httpsAgent = agent
            config.headers['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.108 Safari/537.36'

            //Monta o Body do login
            let bodyLogar = new Object();
            bodyLogar.login = dados.usr
            bodyLogar.senha = dados.pass
            bodyLogar.logar = 'Entrar'
            bodyLogar.formLogin = "formLogin"
            bodyLogar["javax.faces.ViewState"] = viewState

            // Loga o usuário no sistema        
            instance.post('sigrh/login.jsf', qs.stringify(bodyLogar), config).then(
                logado => {
                    if (trace) { console.log('[[[Login Realizado]]]') }
                    if (debug) { console.log(logado.headers) }
                    if (debug) { console.log(logado.config) }

                    if (logado.data.indexOf('autenticar-se novamente') != -1) {
                        if (trace) { console.log('[[[Sessão Expirada Após O Login]]]') }
                    } else if (logado.data.indexOf('O sistema comportou-se de forma inesperada') != -1) {
                        if (trace) { console.log('[[[Recebi o aviso: O Sistema se Comportou de Forma Inesperada]]]') }
                    } else if (logado.data.indexOf('e/ou senha inv') != -1) {
                        if (trace) { console.log('{{{Login Ou Senha Inválidos, corrija os dados no arquivo index.js}}}') }
                    }

                    // Verificar em que página estou, se a de ponto ou a pagina inicial            
                    const $logado = cheerio.load(logado.data)
                    let viewStateLogado = $logado('[name="javax.faces.ViewState"]').attr('value')
                    if ($logado('[name="idFormDadosEntradaSaida:idBtnRegistrarSaida"]').length > 0) {
                        realizarSaida(viewStateLogado, config)
                        if (trace) { console.log('[[[Login Redirecionou Para a Página de Saída]]]') }
                    } else if ($logado('[name="idFormDadosEntradaSaida:idBtnRegistrarEntrada"]').length > 0) {
                        if (trace) { console.log('[[[Login Redirecionou Para a Página de Entrada]]]') }
                        realizarEntrada(viewStateLogado, config)
                    } else if ($logado('[name="painelAcessoDadosServidor"]').length > 0) {
                        if (trace) { console.log('[[[Login Redirecionou Para a Página Inicial]]]') }
                        if (trace) { console.log('[[[Navegando para a página de ponto]]]') }
                        navegarParaPonto(viewStateLogado, config)
                    }
                }
            )

        }
    )
}


