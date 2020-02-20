import React from 'react';
import PropTypes from 'prop-types';
import {connect} from "react-redux";
import {downloadFile} from "../../utils"
import {validateBIP32Path, validateExtendedPublicKey, satoshisToBitcoins} from "unchained-bitcoin"

// Components
import { Grid, Box, Drawer, IconButton, Button, FormHelperText, Typography }
  from '@material-ui/core';
import { Settings } from '@material-ui/icons';
import RefreshIcon from '@material-ui/icons/Refresh';

import NetworkPicker from '../NetworkPicker';
import QuorumPicker from '../QuorumPicker';
import AddressTypePicker from '../AddressTypePicker';
import ClientPicker from '../ClientPicker';
import WalletGenerator from './WalletGenerator';
import ExtendedPublicKeyImporter from './ExtendedPublicKeyImporter';
import EditableName from "../EditableName";

// Actions
import {
  setTotalSigners,
  setRequiredSigners,
  setAddressType,
  setNetwork,
} from "../../actions/settingsActions";
import { updateWalletNameAction } from '../../actions/walletActions';
import { setExtendedPublicKeyImporterMethod, setExtendedPublicKeyImporterExtendedPublicKey,
  setExtendedPublicKeyImporterBIP32Path, setExtendedPublicKeyImporterName,
  setExtendedPublicKeyImporterFinalized
} from '../../actions/extendedPublicKeyImporterActions';
import { wrappedActions } from '../../actions/utils';
import {
  SET_CLIENT_TYPE,
  SET_CLIENT_URL,
  SET_CLIENT_USERNAME,
  SET_CLIENT_PASSWORD,
} from '../../actions/clientActions';

const bip32 = require('bip32');

class CreateWallet extends React.Component {

  static propTypes = {
    totalSigners: PropTypes.number.isRequired,
  };

  static defaultProps = {
    bip32,
  }

  state = {
    showSettings: false,
    configError: "",
    configJson: "",
  }

  render = () => {
    const {configuring, walletName, setName, deposits} = this.props;
    
    return (
      <div>
        <h1 style={{marginBottom: 0}} >
        {!Object.keys(deposits.nodes).length && <EditableName number={0} name={walletName} setName={setName} />}
        {Object.keys(deposits.nodes).length > 0 && <span>{walletName}</span>}
        </h1>
        { this.totalBalance() }
        <IconButton 
          onClick={() => this.generatorRefresh()} 
          style={{float: "right", display: this.walletActivated() ? "block" : "none"}}>
            <RefreshIcon/>
        </IconButton>


        <Box>
        <Grid container spacing={3}>
          <Grid item md={configuring ? 8 : 12}>

            {this.renderWalletImporter()}

            {this.renderExtendedPublicKeyImporters()}

            <Box mt={2}><WalletGenerator 
              downloadWalletDetails={this.downloadWalletDetails}
              refreshNodes={click => this.generatorRefresh = click}
              />
            </Box>

          </Grid>
          {this.renderSettings()}
        </Grid>
      </Box>
      </div>
    );
  }

  walletActivated = () => {
    return this.props.info.nodesLoaded;
  }

  totalBalance() {
    const { deposits, change } = this.props;
    if (!Object.keys(deposits.nodes).length) return "";
    const btc = satoshisToBitcoins(deposits.balanceSats.plus(change.balanceSats)).toFixed();

    return <Typography variant="caption">{btc} BTC</Typography>
  }


  validateProperties(config, properties, key) {
    for(let index = 0; index < properties.length; index++) {
      const property = properties[index];
      const configObj = key !== '' ? config[key] : config
      if (!configObj.hasOwnProperty(property)) {
        return `Configuration missing property "${key !== '' ? key+'.' : ''}${property}"`;
      }
    }
    return "";
  }

  validateExtendedPublicKeys(xpubs, network) {
    const xpubFields = {
      name:  (name, index) => typeof name === 'string' ? '' : `Extended public key ${index} name must be a string`,
      bip32Path: (bip32Path, index) =>  {
        if (xpubs[index -1].method === 'text') return "";
        const pathError = validateBIP32Path(bip32Path);
        if (pathError !== "") return `Extended public key ${index} error: ${pathError}`;
        return ""
      },
      xpub: (xpub) => validateExtendedPublicKey(xpub, network),
      method: (method, index) => ~['trezor', 'ledger', 'hermit', 'xpub', 'text'].indexOf(method) ? "" : `Invalid method for extended public key ${index}`
    }

    const keys = Object.keys(xpubFields)
    for(let xpubIndex = 0; xpubIndex < xpubs.length; xpubIndex++) {
      for(let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
        const key = keys[keyIndex];
        const value = xpubs[xpubIndex][key];
        const valueError = xpubFields[key](value, xpubIndex+1);
        if (valueError !== "") return valueError;
      }
    }
    return "";
  }

  validateConfig(config) {
    const configProperties = ["name", "addressType", "network", "client", "quorum", "extendedPublicKeys"];
    const validProperties = this.validateProperties(config, configProperties, '')
    if (validProperties !== "") return validProperties

    const clientProperties = config.client.type === "public" ? ["type"] : ["type", "url", "username"]
    const validClient = this.validateProperties(config, clientProperties, 'client')
    if (validClient !== "") return validClient

    const quorumProperties = ["requiredSigners", "totalSigners"]
    const validQuorum = this.validateProperties(config, quorumProperties, 'quorum')
    if (validQuorum !== "") return validQuorum

    return this.validateExtendedPublicKeys(config.extendedPublicKeys, config.network);
  }

  handleImport = ({ target }) => {
    const fileReader = new FileReader();

    fileReader.readAsText(target.files[0]);
    fileReader.onload = (event) => {
      const configJson = event.target.result;
      let configError
      try {
        const config = JSON.parse(configJson);
        configError = this.validateConfig(config);
      } catch(parseError) {
        configError = "Invlaid JSON";
      }

      this.setState({configJson, configError});
      if (configError === "") this.importDetails();
    };
  };

  importDetails = () => {
    const { configJson } = this.state;
    const { setTotalSigners, setRequiredSigners,setAddressType,
      setNetwork, setExtendedPublicKeyImporterMethod, setExtendedPublicKeyImporterExtendedPublicKey,
      setExtendedPublicKeyImporterBIP32Path, setExtendedPublicKeyImporterFinalized,
      setExtendedPublicKeyImporterName, updateWalletNameAction,
      setClientType, setClientUrl, setClientUsername } = this.props;

    const walletConfiguration = JSON.parse(configJson);
    setTotalSigners(walletConfiguration.quorum.totalSigners);
    setRequiredSigners(walletConfiguration.quorum.requiredSigners);
    setAddressType(walletConfiguration.addressType);
    setNetwork(walletConfiguration.network);
    updateWalletNameAction(0, walletConfiguration.name);
    setClientType(walletConfiguration.client.type);
    if (walletConfiguration.client.type === 'private') {
      setClientUrl(walletConfiguration.client.url);
      setClientUsername(walletConfiguration.client.username);
    }
    walletConfiguration.extendedPublicKeys.forEach((extendedPublicKey, index) => {
      const number = index + 1
      setExtendedPublicKeyImporterName(number, extendedPublicKey.name);
      setExtendedPublicKeyImporterMethod(number, extendedPublicKey.method);
      setExtendedPublicKeyImporterBIP32Path(number, extendedPublicKey.bip32Path);
      setExtendedPublicKeyImporterExtendedPublicKey(number, extendedPublicKey.xpub);
      setExtendedPublicKeyImporterFinalized(number, true);
    })
  }

  renderWalletImporter = () => {
    const { configError } = this.state;
    const {configuring} = this.props;

    if (configuring)
      return (
        <React.Fragment>
          <label htmlFor="upload-config">
            <input
              style={{ display: 'none' }}
              id="upload-config"
              name="upload-config"
              accept="application/json"
              onChange={this.handleImport}
              type="file"
            />

            <Button color="primary" variant="contained" component="span" style={{marginTop: "20px"}}>
              Import Wallet Configuration
            </Button>
          </label>
          <FormHelperText error>{configError}</FormHelperText>
        </React.Fragment>
      );
    return "";
  }

  renderSettings = () => {
    const {configuring} = this.props;
    if (configuring)
      return (
        <Grid item md={4}>
          <Box><QuorumPicker /></Box>
          <Box mt={2}><AddressTypePicker /></Box>
          <Box mt={2}><NetworkPicker /></Box>
          <Box mt={2}><ClientPicker /></Box>
        </Grid>
      )
    else return (
      <div>
      <Box position="fixed" right={10}>
        <IconButton onClick={this.toggleDrawer}>
          <Settings/>
        </IconButton>
      </Box>
      <Drawer md={4} anchor="right" open={this.state.showSettings} onClose={this.toggleDrawer}>
        <Box  width={400}>

          <Box mt={2}><ClientPicker /></Box>
          <Box mt={2} textAlign={"center"}><Button variant="contained" color="primary" onClick={this.downloadWalletDetails}>Export Wallet Details</Button></Box>
        </Box>
      </Drawer>

      </div>
      )
  }

  toggleDrawer = () => {
    this.setState({showSettings: !this.state.showSettings})
  }

  renderExtendedPublicKeyImporters = () => {
    const {totalSigners, configuring} = this.props;
    const extendedPublicKeyImporters = [];
    for (let extendedPublicKeyImporterNum = 1; extendedPublicKeyImporterNum  <= totalSigners; extendedPublicKeyImporterNum++) {
      extendedPublicKeyImporters.push(
        <Box key={extendedPublicKeyImporterNum} mt={extendedPublicKeyImporterNum===1 ? 0 : 2} display={configuring ? 'block' : 'none'}>
          <ExtendedPublicKeyImporter key={extendedPublicKeyImporterNum} number={extendedPublicKeyImporterNum} />
        </Box>
      );
    }
    return extendedPublicKeyImporters;
  }

  downloadWalletDetails = (event) => {
    event.preventDefault();
    const body = this.walletDetailsText();
    const filename = this.walletDetailsFilename();
    downloadFile(body, filename)
  }

  walletDetailsText = () => {
    const {addressType, network, totalSigners, requiredSigners, walletName} = this.props;
    return `{
  "name": "${walletName}",
  "addressType": "${addressType}",
  "network": "${network}",
  "client":  ${this.clientDetails()},
  "quorum": {
    "requiredSigners": ${requiredSigners},
    "totalSigners": ${totalSigners}
  },
  "extendedPublicKeys": [
${this.extendedPublicKeyImporterBIP32Paths()}
  ]
}
`

  }

  clientDetails = () => {
    const {client} = this.props;

    if (client.type === 'private') {
      return `{
    "type": "private",
    "url": "${client.url}",
    "username": "${client.username}"
  }`
    } else {
      return `{
    "type": "public"
  }`
    }

  }

  extendedPublicKeyImporterBIP32Paths = () => {
    const {totalSigners} = this.props;
    let extendedPublicKeyImporterBIP32Paths = [];
    for (let extendedPublicKeyImporterNum = 1; extendedPublicKeyImporterNum <= totalSigners; extendedPublicKeyImporterNum++) {
      extendedPublicKeyImporterBIP32Paths
        .push(`${this.extendedPublicKeyImporterBIP32Path(extendedPublicKeyImporterNum)}${extendedPublicKeyImporterNum < totalSigners ? ',' : ''}`);
    }
    return extendedPublicKeyImporterBIP32Paths.join("\n");
  }

  extendedPublicKeyImporterBIP32Path = (number) => {
    const {extendedPublicKeyImporters} =  this.props;
    const extendedPublicKeyImporter = extendedPublicKeyImporters[number];
    const bip32Path = (extendedPublicKeyImporter.method === 'text' ? 'Unknown (make sure you have written this down previously!)' : extendedPublicKeyImporter.bip32Path);
    return `    {
      "name": "${extendedPublicKeyImporter.name}",
      "bip32Path": "${bip32Path}",
      "xpub": "${extendedPublicKeyImporter.extendedPublicKey}",
      "method": "${extendedPublicKeyImporter.method}"
    }`
  }

  walletDetailsFilename = () => {
    const {totalSigners, requiredSigners, addressType, walletName} = this.props;
    return `bitcoin-${requiredSigners}-of-${totalSigners}-${addressType}-${walletName}.json`;

  }

}

function mapStateToProps(state) {
  return {
    ...state.settings,
    ...state.quorum,
    ...{walletName: state.wallet.info.walletName},
    ...state.wallet,
    client: state.client,
  };
}

const mapDispatchToProps = {
  setName: updateWalletNameAction,
  setTotalSigners,
  setRequiredSigners,
  setAddressType,
  setNetwork,
  setExtendedPublicKeyImporterMethod,
  setExtendedPublicKeyImporterExtendedPublicKey,
  setExtendedPublicKeyImporterBIP32Path,
  setExtendedPublicKeyImporterName,
  setExtendedPublicKeyImporterFinalized,
  updateWalletNameAction,
  ...wrappedActions({
    setClientType: SET_CLIENT_TYPE,
    setClientUrl: SET_CLIENT_URL,
    setClientUsername: SET_CLIENT_USERNAME,
    setClientPassword: SET_CLIENT_PASSWORD,
  })
}

export default connect(mapStateToProps, mapDispatchToProps)(CreateWallet);
