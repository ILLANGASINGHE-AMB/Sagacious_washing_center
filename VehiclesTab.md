## Vehicles Tab ##

### Add a new Tab Named Vehicles to the Nagivation Panel ###

# Overview of the Tab #

Element Cards

|Total Vehicles| |Total distance travelled|

Button Add New Vehicle

## Add New Vehicle Form ##

Vehicel No - must
Vehcile Category - (drop down with double cab, bike, car, lorry)
Model - Name of vehicle (ex:- Prius)

## Table of Page ##

|Vehicle NO|Vehicle Type|Model|Actions|

ex:- |CAD8590 | Car| Prius | View|

Vehicle No is the primary key,
format should be either xx0000 or xxx0000 (both usable)

### Vehicle Profile ###

Page has two separate parts as Upper part and bottom part,

# Upper Part #

if view a vehicle, using the |view| button, it should display the vehicle profile, which contains the following information:

Element Cards

Vehicle No | Vehicle Type | Vehicle Model | Total Distance Travelled|

|Edit|Delete| buttons


## Bottom Part ##
Buttons - |Details| Graph| these buttons should work like page switching in driver and customer profiles

if |Details| button

|TripID|VehicleNo|  driver | start date/time | end date/time | total distance | 

if |Graph| button

the graph should show the total distance travelled by the vehicle over dates
a non linear graph as in driver and customer profiles

distance in (km)
|
|
|
|
|
|-------------------------->Days
