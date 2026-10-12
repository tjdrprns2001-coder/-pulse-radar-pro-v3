from freqtrade.strategy import IStrategy
import talib.abstract as ta
class AtlasBaseline(IStrategy):
    INTERFACE_VERSION=3
    timeframe='1h'
    startup_candle_count=200
    can_short=False
    minimal_roi={'0':0.03}
    stoploss=-0.02
    process_only_new_candles=True
    def populate_indicators(self,dataframe,metadata):
        dataframe['ema20']=ta.EMA(dataframe,timeperiod=20)
        dataframe['ema50']=ta.EMA(dataframe,timeperiod=50)
        dataframe['ema200']=ta.EMA(dataframe,timeperiod=200)
        dataframe['rsi']=ta.RSI(dataframe,timeperiod=14)
        return dataframe
    def populate_entry_trend(self,dataframe,metadata):
        dataframe.loc[(dataframe.close>dataframe.ema20)&(dataframe.ema20>dataframe.ema50)&(dataframe.ema50>dataframe.ema200)&(dataframe.rsi<70)&(dataframe.volume>0),'enter_long']=1
        return dataframe
    def populate_exit_trend(self,dataframe,metadata):
        dataframe.loc[(dataframe.close<dataframe.ema20)&(dataframe.volume>0),'exit_long']=1
        return dataframe
