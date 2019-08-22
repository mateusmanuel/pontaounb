const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio')
const qs = require('qs');
const moment = require('moment');

const URL_PROD = "https://www.sig.unb.br/";
const URL_DESENV = "https://sig.desenv.unb.br/";

var trace = 1;
var debug = 0;

let dataHoje

let dadosp = {
    usr: '02090267151',
    pass: '123456',
}

let dados = {
    usr: 'lucasnbsb',
    pass: 'shoryuken',
}

const agent = new https.Agent({
    rejectUnauthorized: false
});

const instance = axios.create({
    baseURL: 'https://sig.desenv.unb.br/',
});


function somarUmViewState(vs) {
    return vs.substr(0, vs.length - 1) + (parseInt(vs[vs.length - 1]) + 1)
}

function realizarLogoff(cookie) {
    let urlLogoff = 'https://sig.desenv.unb.br/sigrh/LogOff'
    axios.get(urlLogoff, cookie).then(
        saida => {
            if(trace){console.log('Logoff realizado')}
        }
    )
}

function realizarEntrada(viewState, cookie) {
    let url = 'https://sig.desenv.unb.br/sigrh/frequencia/ponto_eletronico/cadastro_ponto_eletronico.jsf'
    let bodyEntrada = new Object();
    bodyEntrada['idFormDadosEntradaSaida'] = 'idFormDadosEntradaSaida'
    bodyEntrada['idFormDadosEntradaSaida:observacoes'] = ''
    bodyEntrada['idFormDadosEntradaSaida:idBtnRegistrarEntrada'] = 'Registrar Entrada'
    bodyEntrada['javax.faces.ViewState'] = viewState
    axios.post(url, qs.stringify(bodyEntrada), cookie).then(
        entrada => {
            const $entrada = cheerio.load(entrada.data)
            let horariosSemana = $entrada('form[name="formHorariosSemana"]').find('span')
            let arrayHorarios = []
            for (let i = 0; i < horariosSemana.length; i++) {
                const horario = horariosSemana[i];
                if(horario && horario.firstChild){
                    arrayHorarios.push(horario.firstChild.data)
                }
            }
            if(trace){console.log('Entrada Realizada, horario: ' + arrayHorarios[arrayHorarios.length-1])}
            realizarLogoff(cookie)
        }
    )
}

function realizarSaida(viewState, cookie) {
    let url = 'https://sig.desenv.unb.br/sigrh/frequencia/ponto_eletronico/cadastro_ponto_eletronico.jsf'
    let bodySaida = new Object();
    bodySaida['idFormDadosEntradaSaida'] = 'idFormDadosEntradaSaida'
    bodySaida['idFormDadosEntradaSaida:observacoes'] = ''
    bodySaida['idFormDadosEntradaSaida:saidaAlmoco'] = 'false'
    bodySaida['idFormDadosEntradaSaida:idBtnRegistrarSaida'] = 'Registrar Saída'    
    bodySaida['javax.faces.ViewState'] = viewState
    
    axios.post(url, qs.stringify(bodySaida), cookie).then(
        saida => {
            const $saida = cheerio.load(saida.data)

            let horariosSemana = $saida('form[name="formHorariosSemana"]').find('span')
            let arrayHorarios = []
            for (let i = 0; i < horariosSemana.length; i++) {
                const horario = horariosSemana[i];
                if(horario && horario.firstChild){
                    arrayHorarios.push(horario.firstChild.data)
                }
            }
            if(trace){console.log('Saída Realizada, horario: ' + arrayHorarios[arrayHorarios.length-1])}
            realizarLogoff(cookie)
        }
    )
}


function navegarParaPonto(viewState, cookie) {
    let bodyNavegar = new Object();
    bodyNavegar['painelAcessoDadosServidor'] = 'painelAcessoDadosServidor'
    bodyNavegar['javax.faces.ViewState'] = viewState
    bodyNavegar['painelAcessoDadosServidor:linkPontoEletronicoAntigo'] = 'painelAcessoDadosServidor:linkPontoEletronicoAntigo'
    instance.post('/sigrh/servidor/portal/servidor.jsf', qs.stringify(bodyNavegar), cookie).then(
        paginaPonto => {
            if(debug){console.log(paginaPonto.headers)}
            if(debug){console.log(paginaPonto.config)}

            if (paginaPonto.data.indexOf('autenticar-se novamente') != -1) {
                if(trace){console.log('Sessão expirada, realizando o logoff')}
                realizarLogoff(cookie)
                pontao()
                return;
            }
            const $paginaPonto = cheerio.load(paginaPonto.data)
            let viewStatePonto = $paginaPonto('[name="javax.faces.ViewState"]').attr('value')
            if ($paginaPonto('[name="idFormDadosEntradaSaida:idBtnRegistrarSaida"]').length > 0) {
                if(trace){console.log('pagina saida')}
                realizarSaida(viewStatePonto, cookie)
            } else if ($paginaPonto('[name="idFormDadosEntradaSaida:idBtnRegistrarEntrada"]').length > 0) {
                if(trace){console.log('pagina entrada')}
                realizarEntrada(viewStatePonto, cookie)
            }
        }
    )
}


pontao()

function pontao() {// get para pegar a página de login do sistem
    this.dataHoje = moment().format('DD/MM/YYYY');

    instance.get('sigrh/login.jsf',{withCredentials: true}).then(
        res => {
            if(trace){console.log('Página de login recebida')}
            if(debug){console.log(res.headers)}
            const $ = cheerio.load(res.data)
            let loginField = $('#login')
            let pasField = $('#senha')
            let viewState = $('[name="javax.faces.ViewState"]').attr('value')
            let sessionId = res.headers['set-cookie'][0].split(';')[0]

            // Monta o cookie para a requisicao
            let config = {}
            config.headers = {}
            config.headers.Cookie = sessionId
            config.withCredentials = 'true'
            config.httpsAgent = agent
                                    
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
                    if(trace){console.log('Login Realizado')}
                    if(debug){console.log(logado.headers)}
                    if(debug){console.log(logado.config)}

                    if (logado.data.indexOf('autenticar-se novamente') != -1) {
                        if(trace){console.log('Sessão expirada, realizando o logoff')}
                    }

                    // Verificar em que página estou, se a de ponto ou a pagina inicial            
                    const $logado = cheerio.load(logado.data)
                    let viewStateLogado = $logado('[name="javax.faces.ViewState"]').attr('value')
                    if ($logado('[name="idFormDadosEntradaSaida:idBtnRegistrarSaida"]').length > 0) {
                        realizarSaida(viewStateLogado, config)
                        if(trace){console.log('pagina saida')}
                    } else if ($logado('[name="idFormDadosEntradaSaida:idBtnRegistrarEntrada"]').length > 0) {
                        if(trace){console.log('pagina entrada')}
                        realizarEntrada(viewStateLogado, config)
                    } else if ($logado('[name="painelAcessoDadosServidor"]').length > 0) {
                        if(trace){console.log('Navegando para a página de ponto')}
                        navegarParaPonto(viewStateLogado, config)
                    }
                }
            )

        }
    )
}


